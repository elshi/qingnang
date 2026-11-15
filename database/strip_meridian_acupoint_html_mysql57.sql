-- MySQL 5.7 / 不支持 REGEXP_REPLACE 的 MariaDB：清理经络、穴位展示字段中的 HTML。
-- 默认以 ROLLBACK 结束，不会持久修改数据。核对结果并完成备份后，将末尾 ROLLBACK 改为 COMMIT。
-- pictures、ID、状态、排序、用户和时间字段不会被修改。
-- 本脚本需要 CREATE ROUTINE 权限；若无权限，请由数据库管理员创建临时函数后执行。
-- 建议先自行创建带日期的完整备份：
-- CREATE TABLE qingnang.t_meridians_backup_YYYYMMDD AS SELECT * FROM qingnang.t_meridians;
-- CREATE TABLE qingnang.t_acupoints_backup_YYYYMMDD AS SELECT * FROM qingnang.t_acupoints;

USE qingnang;
DROP FUNCTION IF EXISTS qingnang_strip_html57;
DELIMITER $$
CREATE FUNCTION qingnang_strip_html57(input_text LONGTEXT)
RETURNS LONGTEXT
DETERMINISTIC
NO SQL
BEGIN
    DECLARE output_text LONGTEXT;
    DECLARE lower_text LONGTEXT;
    DECLARE open_pos INT DEFAULT 0;
    DECLARE close_pos INT DEFAULT 0;
    DECLARE block_end INT DEFAULT 0;
    DECLARE block_close INT DEFAULT 0;
    DECLARE tag_text TEXT;
    DECLARE replacement_text TEXT;

    IF input_text IS NULL THEN RETURN NULL; END IF;
    SET output_text = input_text;

    strip_loop: LOOP
        SET open_pos = LOCATE('<', output_text);
        IF open_pos = 0 THEN LEAVE strip_loop; END IF;
        SET close_pos = LOCATE('>', output_text, open_pos + 1);
        IF close_pos = 0 THEN LEAVE strip_loop; END IF;
        SET tag_text = LOWER(TRIM(SUBSTRING(output_text, open_pos + 1, close_pos - open_pos - 1)));

        IF tag_text LIKE 'script%' OR tag_text LIKE 'style%' THEN
            SET lower_text = LOWER(output_text);
            SET block_end = LOCATE(IF(tag_text LIKE 'script%', '</script', '</style'), lower_text, close_pos + 1);
            IF block_end > 0 THEN
                SET block_close = LOCATE('>', output_text, block_end + 1);
                IF block_close > 0 THEN
                    SET output_text = CONCAT(SUBSTRING(output_text, 1, open_pos - 1), SUBSTRING(output_text, block_close + 1));
                    ITERATE strip_loop;
                END IF;
            END IF;
        END IF;

        SET replacement_text = IF(
            tag_text = 'br' OR tag_text = 'br/' OR tag_text LIKE 'br %'
            OR tag_text IN ('/p', '/div', '/li', '/tr', '/h1', '/h2', '/h3', '/h4', '/h5', '/h6'),
            CHAR(10), ''
        );
        SET output_text = CONCAT(
            SUBSTRING(output_text, 1, open_pos - 1),
            replacement_text,
            SUBSTRING(output_text, close_pos + 1)
        );
    END LOOP;

    SET output_text = REPLACE(REPLACE(output_text, '&nbsp;', ' '), '&#160;', ' ');
    RETURN TRIM(output_text);
END$$
DELIMITER ;

-- 修改前预览。
SELECT meridian_id, name,
       qingnang_strip_html57(indications) AS indications_preview,
       qingnang_strip_html57(measured) AS measured_preview
FROM qingnang.t_meridians
WHERE CONCAT_WS('', name, english_name, indications, measured, acupoints, section, classification, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;'
LIMIT 20;

SELECT acupoint_id, name,
       qingnang_strip_html57(adscription) AS adscription_preview,
       qingnang_strip_html57(locate) AS locate_preview
FROM qingnang.t_acupoints
WHERE CONCAT_WS('', name, pinyin, alias, adscription, indications, locate, acupoints, acupuncture,
                precautions, points, notes, meridian, pulse, fivepoint, specificpoint, position, five, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;'
LIMIT 20;

START TRANSACTION;

UPDATE qingnang.t_meridians
SET name = qingnang_strip_html57(name),
    english_name = qingnang_strip_html57(english_name),
    indications = qingnang_strip_html57(indications),
    measured = qingnang_strip_html57(measured),
    acupoints = qingnang_strip_html57(acupoints),
    section = qingnang_strip_html57(section),
    classification = qingnang_strip_html57(classification),
    abbreviation = qingnang_strip_html57(abbreviation)
WHERE CONCAT_WS('', name, english_name, indications, measured, acupoints, section, classification, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;';

UPDATE qingnang.t_acupoints
SET name = qingnang_strip_html57(name),
    pinyin = qingnang_strip_html57(pinyin),
    alias = qingnang_strip_html57(alias),
    adscription = qingnang_strip_html57(adscription),
    indications = qingnang_strip_html57(indications),
    locate = qingnang_strip_html57(locate),
    acupoints = qingnang_strip_html57(acupoints),
    acupuncture = qingnang_strip_html57(acupuncture),
    precautions = qingnang_strip_html57(precautions),
    points = qingnang_strip_html57(points),
    notes = qingnang_strip_html57(notes),
    meridian = qingnang_strip_html57(meridian),
    pulse = qingnang_strip_html57(pulse),
    fivepoint = qingnang_strip_html57(fivepoint),
    specificpoint = qingnang_strip_html57(specificpoint),
    position = qingnang_strip_html57(position),
    five = qingnang_strip_html57(five),
    abbreviation = qingnang_strip_html57(abbreviation)
WHERE CONCAT_WS('', name, pinyin, alias, adscription, indications, locate, acupoints, acupuncture,
                precautions, points, notes, meridian, pulse, fivepoint, specificpoint, position, five, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;';

-- 修改后核对：两项都应为 0；pictures 不参与检查或修改。
SELECT COUNT(*) AS meridian_rows_still_containing_html
FROM qingnang.t_meridians
WHERE CONCAT_WS('', name, english_name, indications, measured, acupoints, section, classification, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;';

SELECT COUNT(*) AS acupoint_rows_still_containing_html
FROM qingnang.t_acupoints
WHERE CONCAT_WS('', name, pinyin, alias, adscription, indications, locate, acupoints, acupuncture,
                precautions, points, notes, meridian, pulse, fivepoint, specificpoint, position, five, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;';

ROLLBACK;
-- 确认预览、备份和核对结果后，将上一行替换为：COMMIT;

DROP FUNCTION IF EXISTS qingnang_strip_html57;
