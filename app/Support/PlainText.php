<?php

namespace App\Support;

class PlainText
{
    public static function clean($value): string
    {
        if ($value === null) return '';

        $text = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('~<(script|style)\b[^>]*>.*?</\1\s*>~isu', '', $text);
        $text = preg_replace('~<img\b[^>]*>~isu', '', (string) $text);
        $text = preg_replace('~<\s*(?:br\s*/?|/p|/div|/li|/tr|/h[1-6])\s*>~iu', "\n", (string) $text);
        $text = strip_tags((string) $text);
        $text = str_replace(["\xc2\xa0", "\r\n", "\r"], [' ', "\n", "\n"], $text);

        $lines = array_map('trim', explode("\n", $text));
        $text = implode("\n", $lines);
        $text = preg_replace('/[ \t]+/u', ' ', $text);
        $text = preg_replace('/\n{3,}/u', "\n\n", (string) $text);

        return trim((string) $text);
    }

    public static function preview($value, int $length = 120): string
    {
        $text = self::clean($value);
        return mb_strlen($text) > $length ? mb_substr($text, 0, $length) . '…' : $text;
    }
}
