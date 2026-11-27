-- 在同一 MySQL 会话中运行整个文件。适用 MySQL 5.7 / 8.x，表须使用事务引擎（如 InnoDB）。
-- 需要 SELECT、UPDATE 和存储函数的创建/删除权限。执行出错时停止。
-- 默认预演：检查清洗前后的文本和剩余行数。备份后将末尾 ROLLBACK 改为 COMMIT，可保存结果。
USE qingnang;
SET NAMES utf8mb4;

DELIMITER $$
CREATE FUNCTION qn_acupoint_plaintext_cleanup(s LONGTEXT CHARACTER SET utf8mb4)
RETURNS LONGTEXT CHARACTER SET utf8mb4
DETERMINISTIC NO SQL SQL SECURITY INVOKER
BEGIN
    DECLARE posn, opening, ending, tag_start, tag_end, closing INT;
    DECLARE tag_name TEXT;
    DECLARE ch, quote_ch VARCHAR(1);
    DECLARE output_text LONGTEXT DEFAULT '';
    DECLARE chunk LONGTEXT;
    DECLARE needs_break BOOLEAN DEFAULT FALSE;

    IF s IS NULL OR INSTR(s, '<') = 0 THEN RETURN s; END IF;
    SET posn = 1;
    scan: WHILE posn <= CHAR_LENGTH(s) DO
        SET opening = LOCATE('<', s, posn);
        IF opening = 0 THEN SET opening = CHAR_LENGTH(s) + 1; END IF;
        SET chunk = SUBSTRING(s, posn, opening - posn);
        IF CHAR_LENGTH(chunk) > 0 THEN
            IF needs_break AND RIGHT(output_text, 1) NOT IN (CHAR(10), CHAR(13))
               AND LEFT(chunk, 1) NOT IN (CHAR(10), CHAR(13)) THEN
                SET output_text = CONCAT(output_text, CHAR(10));
            END IF;
            SET output_text = CONCAT(output_text, chunk), needs_break = FALSE;
        END IF;
        IF opening > CHAR_LENGTH(s) THEN LEAVE scan; END IF;

        IF SUBSTRING(s, opening, 4) = '<!--' THEN
            SET ending = LOCATE('-->', s, opening + 4);
            IF ending > 0 THEN SET posn = ending + 3; ITERATE scan; END IF;
        END IF;
        SET tag_start = opening + 1;
        IF SUBSTRING(s, tag_start, 1) = '/' THEN SET tag_start = tag_start + 1; END IF;
        SET tag_end = tag_start;
        IF LOWER(SUBSTRING(s, tag_start, 1)) REGEXP '^[a-z]$' THEN
            WHILE SUBSTRING(s, tag_end, 1) REGEXP '^[a-zA-Z0-9:_-]$' DO
                SET tag_end = tag_end + 1;
            END WHILE;
        END IF;
        -- 普通比较符，例如“角度 < 30”，按原文保留。
        IF tag_end = tag_start OR SUBSTRING(s, tag_end, 1) NOT REGEXP '^[[:space:]/>]$' THEN
            SET output_text = CONCAT(output_text, '<'), posn = opening + 1;
            ITERATE scan;
        END IF;
        SET tag_name = LOWER(SUBSTRING(s, tag_start, tag_end - tag_start));
        SET ending = tag_end, quote_ch = '';
        scan_tag: WHILE ending <= CHAR_LENGTH(s) DO
            SET ch = SUBSTRING(s, ending, 1);
            IF quote_ch <> '' THEN
                IF ch = quote_ch THEN SET quote_ch = ''; END IF;
            ELSEIF ch IN (CHAR(34), CHAR(39)) THEN
                SET quote_ch = ch;
            ELSEIF ch = '>' THEN
                LEAVE scan_tag;
            END IF;
            SET ending = ending + 1;
        END WHILE;
        IF ending > CHAR_LENGTH(s) THEN RETURN CONCAT(output_text, SUBSTRING(s, opening)); END IF;
        SET posn = ending + 1;
        IF tag_start = opening + 1 AND tag_name IN ('script', 'style') THEN
            SET closing = LOCATE(CONCAT('</', tag_name), LOWER(s), posn);
            WHILE closing > 0 AND SUBSTRING(s, closing + 2 + CHAR_LENGTH(tag_name), 1)
                    NOT REGEXP '^[[:space:]>]$' DO
                SET closing = LOCATE(CONCAT('</', tag_name), LOWER(s), closing + 2);
            END WHILE;
            IF closing = 0 THEN LEAVE scan; END IF;
            SET ending = LOCATE('>', s, closing);
            IF ending = 0 THEN LEAVE scan; END IF;
            SET posn = ending + 1;
        ELSEIF tag_name IN ('br','p','div','li','tr','h1','h2','h3','h4','h5','h6') THEN
            SET needs_break = CHAR_LENGTH(output_text) > 0;
        END IF;
    END WHILE;
    RETURN output_text;
END$$
DELIMITER ;

SET @qn_markup = '<!--|</?[a-zA-Z][a-zA-Z0-9:_-]*[[:space:]/>]';
START TRANSACTION;

-- 优先展示含定位图或图片字段含标记的记录。
SELECT acupoint_id, name,
       locate AS locate_before, qn_acupoint_plaintext_cleanup(locate) AS locate_after,
       pictures AS pictures_before, qn_acupoint_plaintext_cleanup(pictures) AS pictures_after
FROM t_acupoints
WHERE `name` REGEXP @qn_markup
    OR `pinyin` REGEXP @qn_markup
    OR `alias` REGEXP @qn_markup
    OR `adscription` REGEXP @qn_markup
    OR `indications` REGEXP @qn_markup
    OR `locate` REGEXP @qn_markup
    OR `acupoints` REGEXP @qn_markup
    OR `acupuncture` REGEXP @qn_markup
    OR `precautions` REGEXP @qn_markup
    OR `points` REGEXP @qn_markup
    OR `notes` REGEXP @qn_markup
    OR `meridian` REGEXP @qn_markup
    OR `pulse` REGEXP @qn_markup
    OR `fivepoint` REGEXP @qn_markup
    OR `specificpoint` REGEXP @qn_markup
    OR `position` REGEXP @qn_markup
    OR `five` REGEXP @qn_markup
    OR `abbreviation` REGEXP @qn_markup
    OR `pictures` REGEXP @qn_markup
ORDER BY (COALESCE(pictures, '') REGEXP @qn_markup OR COALESCE(locate, '') REGEXP @qn_markup) DESC, acupoint_id
LIMIT 20;

UPDATE t_acupoints
SET `name` = qn_acupoint_plaintext_cleanup(`name`),
    `pinyin` = qn_acupoint_plaintext_cleanup(`pinyin`),
    `alias` = qn_acupoint_plaintext_cleanup(`alias`),
    `adscription` = qn_acupoint_plaintext_cleanup(`adscription`),
    `indications` = qn_acupoint_plaintext_cleanup(`indications`),
    `locate` = qn_acupoint_plaintext_cleanup(`locate`),
    `acupoints` = qn_acupoint_plaintext_cleanup(`acupoints`),
    `acupuncture` = qn_acupoint_plaintext_cleanup(`acupuncture`),
    `precautions` = qn_acupoint_plaintext_cleanup(`precautions`),
    `points` = qn_acupoint_plaintext_cleanup(`points`),
    `notes` = qn_acupoint_plaintext_cleanup(`notes`),
    `meridian` = qn_acupoint_plaintext_cleanup(`meridian`),
    `pulse` = qn_acupoint_plaintext_cleanup(`pulse`),
    `fivepoint` = qn_acupoint_plaintext_cleanup(`fivepoint`),
    `specificpoint` = qn_acupoint_plaintext_cleanup(`specificpoint`),
    `position` = qn_acupoint_plaintext_cleanup(`position`),
    `five` = qn_acupoint_plaintext_cleanup(`five`),
    `abbreviation` = qn_acupoint_plaintext_cleanup(`abbreviation`),
    `pictures` = qn_acupoint_plaintext_cleanup(`pictures`)
WHERE `name` REGEXP @qn_markup
    OR `pinyin` REGEXP @qn_markup
    OR `alias` REGEXP @qn_markup
    OR `adscription` REGEXP @qn_markup
    OR `indications` REGEXP @qn_markup
    OR `locate` REGEXP @qn_markup
    OR `acupoints` REGEXP @qn_markup
    OR `acupuncture` REGEXP @qn_markup
    OR `precautions` REGEXP @qn_markup
    OR `points` REGEXP @qn_markup
    OR `notes` REGEXP @qn_markup
    OR `meridian` REGEXP @qn_markup
    OR `pulse` REGEXP @qn_markup
    OR `fivepoint` REGEXP @qn_markup
    OR `specificpoint` REGEXP @qn_markup
    OR `position` REGEXP @qn_markup
    OR `five` REGEXP @qn_markup
    OR `abbreviation` REGEXP @qn_markup
    OR `pictures` REGEXP @qn_markup;

SELECT ROW_COUNT() AS changed_rows;
SELECT COUNT(*) AS rows_with_remaining_markup
FROM t_acupoints
WHERE `name` REGEXP @qn_markup
    OR `pinyin` REGEXP @qn_markup
    OR `alias` REGEXP @qn_markup
    OR `adscription` REGEXP @qn_markup
    OR `indications` REGEXP @qn_markup
    OR `locate` REGEXP @qn_markup
    OR `acupoints` REGEXP @qn_markup
    OR `acupuncture` REGEXP @qn_markup
    OR `precautions` REGEXP @qn_markup
    OR `points` REGEXP @qn_markup
    OR `notes` REGEXP @qn_markup
    OR `meridian` REGEXP @qn_markup
    OR `pulse` REGEXP @qn_markup
    OR `fivepoint` REGEXP @qn_markup
    OR `specificpoint` REGEXP @qn_markup
    OR `position` REGEXP @qn_markup
    OR `five` REGEXP @qn_markup
    OR `abbreviation` REGEXP @qn_markup
    OR `pictures` REGEXP @qn_markup;

ROLLBACK;
DROP FUNCTION qn_acupoint_plaintext_cleanup;
