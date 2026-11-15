-- MySQL 8.0+：清理经络、穴位展示字段中的 HTML。
-- 默认以 ROLLBACK 结束，不会持久修改数据。核对结果并完成备份后，将末尾 ROLLBACK 改为 COMMIT。
-- pictures、ID、状态、排序、用户和时间字段不会被修改。
-- 本脚本需要 CREATE ROUTINE 权限，用于创建执行期间使用的清洗函数。
-- 建议先自行创建带日期的完整备份：
-- CREATE TABLE qingnang.t_meridians_backup_YYYYMMDD AS SELECT * FROM qingnang.t_meridians;
-- CREATE TABLE qingnang.t_acupoints_backup_YYYYMMDD AS SELECT * FROM qingnang.t_acupoints;

USE qingnang;
DROP FUNCTION IF EXISTS qingnang_strip_html8;
DELIMITER $$
CREATE FUNCTION qingnang_strip_html8(input_text LONGTEXT)
RETURNS LONGTEXT
DETERMINISTIC
NO SQL
BEGIN
    DECLARE output_text LONGTEXT;
    IF input_text IS NULL THEN RETURN NULL; END IF;

    SET output_text = REGEXP_REPLACE(input_text, '<script[^>]*>.*?</script\\s*>', '', 1, 0, 'in');
    SET output_text = REGEXP_REPLACE(output_text, '<style[^>]*>.*?</style\\s*>', '', 1, 0, 'in');
    SET output_text = REGEXP_REPLACE(output_text, '<img[^>]*>', '', 1, 0, 'i');
    SET output_text = REGEXP_REPLACE(
        output_text,
        '<\\s*(br\\s*/?|/p\\s*|/div\\s*|/li\\s*|/tr\\s*|/h[1-6]\\s*)>',
        CHAR(10), 1, 0, 'i'
    );
    SET output_text = REGEXP_REPLACE(output_text, '<[^>]*>', '');
    SET output_text = REPLACE(REPLACE(output_text, '&nbsp;', ' '), '&#160;', ' ');
    RETURN TRIM(output_text);
END$$
DELIMITER ;

-- 修改前预览。
SELECT meridian_id, name,
       qingnang_strip_html8(indications) AS indications_preview,
       qingnang_strip_html8(measured) AS measured_preview
FROM qingnang.t_meridians
WHERE CONCAT_WS('', name, english_name, indications, measured, acupoints, section, classification, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;'
LIMIT 20;

SELECT acupoint_id, name,
       qingnang_strip_html8(adscription) AS adscription_preview,
       qingnang_strip_html8(locate) AS locate_preview
FROM qingnang.t_acupoints
WHERE CONCAT_WS('', name, pinyin, alias, adscription, indications, locate, acupoints, acupuncture,
                precautions, points, notes, meridian, pulse, fivepoint, specificpoint, position, five, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;'
LIMIT 20;

START TRANSACTION;

UPDATE qingnang.t_meridians
SET name = qingnang_strip_html8(name),
    english_name = qingnang_strip_html8(english_name),
    indications = qingnang_strip_html8(indications),
    measured = qingnang_strip_html8(measured),
    acupoints = qingnang_strip_html8(acupoints),
    section = qingnang_strip_html8(section),
    classification = qingnang_strip_html8(classification),
    abbreviation = qingnang_strip_html8(abbreviation)
WHERE CONCAT_WS('', name, english_name, indications, measured, acupoints, section, classification, abbreviation)
      REGEXP '<[^>]+>|&nbsp;|&#160;';

UPDATE qingnang.t_acupoints
SET name = qingnang_strip_html8(name),
    pinyin = qingnang_strip_html8(pinyin),
    alias = qingnang_strip_html8(alias),
    adscription = qingnang_strip_html8(adscription),
    indications = qingnang_strip_html8(indications),
    locate = qingnang_strip_html8(locate),
    acupoints = qingnang_strip_html8(acupoints),
    acupuncture = qingnang_strip_html8(acupuncture),
    precautions = qingnang_strip_html8(precautions),
    points = qingnang_strip_html8(points),
    notes = qingnang_strip_html8(notes),
    meridian = qingnang_strip_html8(meridian),
    pulse = qingnang_strip_html8(pulse),
    fivepoint = qingnang_strip_html8(fivepoint),
    specificpoint = qingnang_strip_html8(specificpoint),
    position = qingnang_strip_html8(position),
    five = qingnang_strip_html8(five),
    abbreviation = qingnang_strip_html8(abbreviation)
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

DROP FUNCTION IF EXISTS qingnang_strip_html8;
