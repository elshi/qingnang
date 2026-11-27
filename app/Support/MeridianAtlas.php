<?php

namespace App\Support;

use App\Acupoint;
use App\Meridian;
use Illuminate\Support\Facades\DB;

class MeridianAtlas
{
    public static function connection()
    {
        return DB::connection(config('database.meridians_connection'));
    }

    // Companion tables live in the same schema as the configured catalog.
    public static function table(string $name): string
    {
        $table = (new Meridian)->getTable();
        $dot = strrpos($table, '.');
        return ($dot === false ? '' : substr($table, 0, $dot + 1)) . $name;
    }

    public static function graphics(): array
    {
        return json_decode(file_get_contents(database_path('atlas/graphics.json')), true, 512, JSON_THROW_ON_ERROR);
    }

    public static function installed(string $name): bool
    {
        $db = self::connection();
        $table = self::table($name);
        if ($db->getDriverName() === 'mysql' && strpos($table, '.') !== false) {
            list($schema, $plain) = explode('.', $table, 2);
            return $db->table('information_schema.tables')->where('table_schema', $schema)
                ->where('table_name', $plain)->exists();
        }
        return $db->getSchemaBuilder()->hasTable($table);
    }

    private static function image(array $image): array
    {
        $base = rtrim(config('app.asset_url') ?: config('app.url'), '/');
        $parts = parse_url($base);
        if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user'])
            || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            throw new \RuntimeException('请配置 HTTPS 图片域名 ASSET_URL');
        }
        foreach (['preview', 'full'] as $size) {
            $image[$size . '_url'] = $base . '/images/meridians/' . $image[$size];
            unset($image[$size]);
        }
        return $image;
    }

    public static function pointDetail(int $id, string $name): array
    {
        if (!self::installed('t_acupoint_review')) return [];
        $db = self::connection();
        $json = $db->table(self::table('t_acupoint_review'))->where('acupoint_id', $id)->value('sources');
        if (!$json) return [];
        $review = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        $data = ['review' => $review];
        $owned = $db->table(self::table('t_meridian_atlas_points').' as p')
            ->join(self::table('t_meridian_atlas').' as a', 'a.meridian_id', '=', 'p.meridian_id')
            ->where('p.acupoint_id', $id)->where('p.kind', 'owned')->first(['a.slug','p.point_code']);
        if ($owned) {
            foreach (self::graphics()['channels'][$owned->slug] as $plate) {
                if (in_array($owned->point_code, $plate['codes'], true)) {
                    $data['atlas_plate'] = self::image($plate);
                    break;
                }
            }
        } else {
            $extras = json_decode(file_get_contents(database_path('atlas/extra-graphics.json')), true, 512, JSON_THROW_ON_ERROR);
            if (isset($extras[$name])) $data['atlas_plate'] = self::image($extras[$name]);
        }
        return $data;
    }

    public static function overview(): array
    {
        $graphics = self::graphics();
        $rows = self::connection()->table(self::table('t_meridian_atlas').' as a')
            ->join((new Meridian)->getTable().' as m','m.meridian_id','=','a.meridian_id')
            ->orderBy('a.display_order')->get(['a.meridian_id','a.slug','a.group_key','a.payload','m.name']);
        $groups = [];
        foreach (['regular'=>'十二正经', 'extraordinary'=>'奇经八脉'] as $key=>$label) {
            $items = [];
            foreach ($rows as $row) {
                if ($row->group_key !== $key) continue;
                $p = json_decode($row->payload, true);
                $items[] = ['id'=>(int)$row->meridian_id, 'key'=>$row->slug, 'title'=>$row->name,
                    'code'=>$p['code'], 'color'=>$p['color']];
            }
            if (count($items) !== ($key==='regular' ? 12 : 8)) {
                throw new \RuntimeException('经络目录尚未完成导入');
            }
            $groups[] = ['key'=>$key,'label'=>$label,'image'=>self::image($graphics['groups'][$key]),'items'=>$items];
        }
        return ['groups'=>$groups];
    }

    public static function detail(int $id): array
    {
        $db = self::connection();
        $table = self::table('t_meridian_atlas');
        // Existing installations and unrelated legacy records retain their original detail response.
        if (!self::installed('t_meridian_atlas')) return [];
        $entry = $db->table($table)->where('meridian_id', $id)->first();
        if (!$entry) return [];
        $p = json_decode($entry->payload, true, 512, JSON_THROW_ON_ERROR);
        $links = $db->table(self::table('t_meridian_atlas_points'))->where('meridian_id',$id)->orderBy('display_order')->get();
        $records = Acupoint::query()->whereIn('acupoint_id',$links->pluck('acupoint_id'))->get(['acupoint_id','name'])->keyBy('acupoint_id');
        $points = [];
        foreach ($links as $link) {
            $record = $records->get($link->acupoint_id);
            if (!$record) throw new \RuntimeException('穴位关联数据不完整');
            $points[] = ['id'=>(int)$record->acupoint_id,'name'=>preg_replace('/\s*[（(][^（）()]+[）)]\s*$/u','',PlainText::clean($record->name)),
                'code'=>$link->point_code,'relation'=>$link->kind];
        }
        $graphics=self::graphics();
        $ids = array_column($points, 'id', 'code');
        $plates = [];
        foreach ($graphics['channels'][$entry->slug] as $plate) {
            $plate['point_ids'] = array_map(function ($code) use ($ids) { return $ids[$code]; }, $plate['codes']);
            $plates[] = self::image($plate);
        }
        return ['atlas_key'=>$entry->slug,'route'=>$p['route'],'code'=>$p['code'],'sections'=>$p['sections'],
            'point_label'=>$p['kind']==='owned'?'所属穴位':'交会穴','related_points'=>$points,
            'point_source'=>$p['kind']==='owned'?'GB/T 12346—2021':'甘肃中医药大学附属医院《奇经八脉》交会腧穴',
            'plates'=>$plates,
            'atlas_credit'=>$graphics['credit']];
    }
}

