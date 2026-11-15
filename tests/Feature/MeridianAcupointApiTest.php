<?php

namespace Tests\Feature;

use App\Acupoint;
use App\Meridian;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MeridianAcupointApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        Schema::create('t_meridians', function (Blueprint $table) {
            $table->unsignedInteger('meridian_id')->primary();
            foreach (['name', 'english_name', 'pictures', 'indications', 'measured', 'acupoints', 'section', 'classification', 'abbreviation'] as $field) {
                $table->text($field)->nullable();
            }
            $table->unsignedInteger('item_order')->default(0);
            $table->unsignedTinyInteger('status')->default(1);
        });
        Schema::create('t_acupoints', function (Blueprint $table) {
            $table->unsignedInteger('acupoint_id')->primary();
            foreach ([
                'name', 'pinyin', 'alias', 'adscription', 'pictures', 'indications', 'locate',
                'acupoints', 'acupuncture', 'precautions', 'points', 'notes', 'meridian',
                'pulse', 'fivepoint', 'specificpoint', 'position', 'five', 'abbreviation'
            ] as $field) {
                $table->text($field)->nullable();
            }
            $table->unsignedInteger('item_order')->default(0);
            $table->unsignedTinyInteger('status')->default(1);
        });

        $meridians = [
            [
                'meridian_id' => 1, 'name' => '手太阴肺经', 'english_name' => 'Lung Meridian',
                'pictures' => '<img src="route.jpg">不应返回',
                'indications' => '<img src="x.jpg">《灵枢》<br><a href="javascript:void(0)">肺</a>&nbsp;经<script>bad()</script>',
                'measured' => '<p>中府</p><p>云门</p>', 'acupoints' => '&lt;b&gt;肺经十一穴&lt;/b&gt;',
                'section' => '肺', 'classification' => '十二正经', 'abbreviation' => 'styfj',
                'item_order' => 0, 'status' => 0,
            ],
            [
                'meridian_id' => 2, 'name' => '手阳明大肠经', 'english_name' => 'Large Intestine Meridian',
                'indications' => '主治头面疾病', 'section' => '大肠', 'classification' => '十二正经',
                'abbreviation' => 'symdcj', 'item_order' => 1, 'status' => 2,
            ],
            [
                'meridian_id' => 0, 'name' => '零号经络', 'classification' => '测试',
                'item_order' => 99, 'status' => 1,
            ],
        ];
        foreach ($meridians as $meridian) DB::table('t_meridians')->insert($meridian);

        $acupoints = [
            [
                'acupoint_id' => 1, 'name' => '中府（LU1）', 'pinyin' => 'Zhōng Fǔ',
                'alias' => '<a href="#">府中俞</a><br>肺募', 'adscription' => '手太阴肺经，肺之募穴',
                'pictures' => '<img src="point.jpg">', 'indications' => '<p>喘咳</p><p>胸满</p>',
                'locate' => '<a href="#">云门</a>下一寸', 'acupoints' => '双手叉腰取穴<img src="find.jpg">',
                'acupuncture' => '针三分', 'precautions' => '<style>x{}</style>慎刺',
                'points' => '配云门', 'notes' => '学习用', 'meridian' => '手太阴肺经', 'pulse' => '',
                'fivepoint' => '', 'specificpoint' => '募穴', 'position' => '胸腹部穴位', 'five' => '',
                'abbreviation' => 'zf', 'item_order' => 1, 'status' => 0,
            ],
            [
                'acupoint_id' => 332, 'name' => '云门（LU2）', 'pinyin' => 'Yún Mén',
                'adscription' => '手太阴肺经', 'locate' => '锁骨下窝', 'meridian' => '手太阴肺经',
                'item_order' => 2, 'status' => 2,
            ],
            [
                'acupoint_id' => 9, 'name' => '照海（KI6）', 'pinyin' => 'Zhào Hǎi',
                'adscription' => '足少阴肾经', 'pulse' => '阴跷脉', 'meridian' => '足少阴肾经',
                'item_order' => 1, 'status' => 1,
            ],
            [
                'acupoint_id' => 0, 'name' => '零号穴（T0）', 'item_order' => 99, 'status' => 1,
            ],
        ];
        foreach ($acupoints as $acupoint) DB::table('t_acupoints')->insert($acupoint);
    }

    public function test_meridian_list_uses_real_ids_order_search_and_ignores_status()
    {
        $this->assertSame('sqlite', (new Meridian())->getConnectionName());
        $this->getJson('/api/meridians?page_size=2')->assertOk()
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.items.0.id', 1)
            ->assertJsonPath('data.items.0.title', '手太阴肺经')
            ->assertJsonPath('data.items.1.id', 2)
            ->assertJsonPath('data.has_more', true);
        $this->getJson('/api/meridians?keyword=' . urlencode('肺 Lung'))->assertOk()
            ->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.id', 1);
    }

    public function test_meridian_detail_strips_html_and_never_returns_pictures_or_system_fields()
    {
        $response = $this->getJson('/api/meridians/1')->assertOk()
            ->assertJsonPath('data.indications', "《灵枢》\n肺 经")
            ->assertJsonPath('data.measured', "中府\n云门")
            ->assertJsonPath('data.acupoints', '肺经十一穴');
        $data = $response->json('data');
        $this->assertArrayNotHasKey('pictures', $data);
        $this->assertArrayNotHasKey('status', $data);
        $this->assertStringNotContainsString('<', json_encode($data, JSON_UNESCAPED_UNICODE));
    }

    public function test_acupoint_list_filters_channels_searches_and_splits_name_and_code()
    {
        $this->assertSame('sqlite', (new Acupoint())->getConnectionName());
        $this->getJson('/api/acupoints?channel=' . urlencode('手太阴肺经') . '&page_size=100')->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.items.0.id', 1)
            ->assertJsonPath('data.items.0.title', '中府（LU1）')
            ->assertJsonPath('data.items.0.name', '中府')
            ->assertJsonPath('data.items.0.code', 'LU1')
            ->assertJsonPath('data.items.1.id', 332);
        $this->getJson('/api/acupoints?channel=' . urlencode('阴跷脉'))->assertOk()
            ->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.id', 9);
        $this->getJson('/api/acupoints?keyword=' . urlencode('Zhōng zf'))->assertOk()
            ->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.id', 1);
    }

    public function test_acupoint_detail_returns_all_clean_business_fields_without_pictures()
    {
        $response = $this->getJson('/api/acupoints/1')->assertOk()
            ->assertJsonPath('data.alias', "府中俞\n肺募")
            ->assertJsonPath('data.indications', "喘咳\n胸满")
            ->assertJsonPath('data.locate', '云门下一寸')
            ->assertJsonPath('data.acupoints', '双手叉腰取穴')
            ->assertJsonPath('data.precautions', '慎刺')
            ->assertJsonPath('data.specificpoint', '募穴');
        $data = $response->json('data');
        $this->assertArrayNotHasKey('pictures', $data);
        $this->assertArrayNotHasKey('status', $data);
        $this->assertStringNotContainsString('<', json_encode($data, JSON_UNESCAPED_UNICODE));
    }

    public function test_unsigned_zero_ids_are_valid_and_bad_or_missing_ids_are_explicit()
    {
        $this->getJson('/api/meridians/0')->assertOk()->assertJsonPath('data.title', '零号经络');
        $this->getJson('/api/acupoints/0')->assertOk()->assertJsonPath('data.name', '零号穴');
        foreach (['-1', '1.5', 'meridian-lung', '4294967296'] as $id) {
            $this->getJson('/api/meridians/' . $id)->assertStatus(422)->assertJsonPath('code', -1);
            $this->getJson('/api/acupoints/' . $id)->assertStatus(422)->assertJsonPath('code', -1);
        }
        $this->getJson('/api/meridians/99')->assertStatus(404)->assertJsonPath('errorMsg', '未找到该经络');
        $this->getJson('/api/acupoints/99')->assertStatus(404)->assertJsonPath('errorMsg', '未找到该穴位');
    }

    public function test_list_parameters_are_validated()
    {
        foreach (['page=0', 'page_size=51', 'keyword[]=x', 'keyword=' . str_repeat('a', 101)] as $query) {
            $this->getJson('/api/meridians?' . $query)->assertStatus(422)->assertJsonPath('code', -1);
        }
        foreach (['page=0', 'page_size=101', 'channel[]=x', 'channel=' . str_repeat('a', 31)] as $query) {
            $this->getJson('/api/acupoints?' . $query)->assertStatus(422)->assertJsonPath('code', -1);
        }
    }

    public function test_database_failures_return_safe_errors()
    {
        Schema::drop('t_meridians');
        $meridians = $this->getJson('/api/meridians')->assertStatus(500)->assertJsonPath('code', -1);
        $this->assertStringNotContainsString('SQLSTATE', $meridians->getContent());
        Schema::drop('t_acupoints');
        $acupoints = $this->getJson('/api/acupoints/1')->assertStatus(500)->assertJsonPath('code', -1);
        $this->assertStringNotContainsString('SQLSTATE', $acupoints->getContent());
    }
}
