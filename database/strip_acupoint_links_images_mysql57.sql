-- MySQL 5.7+。在同一会话中按顺序执行，遇错停止。
USE qingnang;
DELIMITER $$
CREATE FUNCTION qn_strip_a_img(s LONGTEXT CHARACTER SET utf8mb4)
RETURNS LONGTEXT CHARACTER SET utf8mb4
DETERMINISTIC NO SQL SQL SECURITY INVOKER
BEGIN
    DECLARE p, e, closing INT DEFAULT 1;
    DECLARE head VARCHAR(16);
    DECLARE raw_tag VARCHAR(8);
    DECLARE ch, q VARCHAR(1);

    IF s IS NULL THEN RETURN NULL; END IF;
    scan: LOOP
        SET p = LOCATE('<', s, p);
        IF p = 0 THEN LEAVE scan; END IF;
        SET head = LOWER(SUBSTRING(s, p, 16));
        IF LEFT(head, 4) = '<!--' THEN
            SET e = LOCATE('-->', s, p + 4);
            IF e = 0 THEN LEAVE scan; END IF;
            SET p = e + 3;
            ITERATE scan;
        END IF;
        IF head NOT REGEXP '^</?[a-z]|^<!|^<[?]' THEN
            SET p = p + 1;
            ITERATE scan;
        END IF;

        -- 引号内的 > 属于属性值。
        SET e = p + 1, q = '';
        tag_end: WHILE e <= CHAR_LENGTH(s) DO
            SET ch = SUBSTRING(s, e, 1);
            IF q <> '' THEN
                IF ch = q THEN SET q = ''; END IF;
            ELSEIF ch IN (CHAR(34), CHAR(39)) THEN
                SET q = ch;
            ELSEIF ch = '>' THEN
                LEAVE tag_end;
            END IF;
            SET e = e + 1;
        END WHILE;
        IF e > CHAR_LENGTH(s) THEN LEAVE scan; END IF;

        IF head REGEXP '^</?a[[:space:]/>]|^<img[[:space:]/>]' THEN
            SET s = INSERT(s, p, e - p + 1, '');
        ELSE
            SET p = e + 1;
            IF head REGEXP '^<(script|style|textarea|title)[[:space:]/>]' THEN
                SET raw_tag = CASE WHEN head LIKE '<script%' THEN 'script'
                                   WHEN head LIKE '<style%' THEN 'style'
                                   WHEN head LIKE '<title%' THEN 'title' ELSE 'textarea' END;
                SET closing = LOCATE(CONCAT('</', raw_tag), LOWER(s), p);
                WHILE closing > 0 AND SUBSTRING(s, closing + 2 + CHAR_LENGTH(raw_tag), 1)
                      NOT REGEXP '^[[:space:]>]$' DO
                    SET closing = LOCATE(CONCAT('</', raw_tag), LOWER(s), closing + 2);
                END WHILE;
                IF closing = 0 THEN LEAVE scan; END IF;
                SET p = closing;
            END IF;
        END IF;
    END LOOP;
    RETURN s;
END$$
DELIMITER ;

UPDATE t_acupoints
SET `name` = qn_strip_a_img(`name`),
    `pinyin` = qn_strip_a_img(`pinyin`),
    `alias` = qn_strip_a_img(`alias`),
    `adscription` = qn_strip_a_img(`adscription`),
    `pictures` = qn_strip_a_img(`pictures`),
    `indications` = qn_strip_a_img(`indications`),
    `locate` = qn_strip_a_img(`locate`),
    `acupoints` = qn_strip_a_img(`acupoints`),
    `acupuncture` = qn_strip_a_img(`acupuncture`),
    `precautions` = qn_strip_a_img(`precautions`),
    `points` = qn_strip_a_img(`points`),
    `notes` = qn_strip_a_img(`notes`),
    `meridian` = qn_strip_a_img(`meridian`),
    `pulse` = qn_strip_a_img(`pulse`),
    `fivepoint` = qn_strip_a_img(`fivepoint`),
    `specificpoint` = qn_strip_a_img(`specificpoint`),
    `position` = qn_strip_a_img(`position`),
    `five` = qn_strip_a_img(`five`),
    `abbreviation` = qn_strip_a_img(`abbreviation`)
WHERE LOWER(CONCAT_WS(CHAR(10),
    name, pinyin, alias, adscription, pictures, indications, locate, acupoints, acupuncture,
    precautions, points, notes, meridian, pulse, fivepoint, specificpoint, position, five, abbreviation
)) REGEXP '</?a[[:space:]/>]|<img[[:space:]/>]';

DROP FUNCTION qn_strip_a_img;
