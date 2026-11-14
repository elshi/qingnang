<?php

namespace Tests\Feature;

use App\Prescription;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PrescriptionApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        Schema::create('t_prescriptions', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            foreach (['name', 'modern_dose', 'decoction', 'indications', 'explanation', 'cited', 'tags', 'abbreviation', 'item_order'] as $field) {
                $table->text($field)->nullable();
            }
        });
        DB::table('t_prescriptions')->insert(require __DIR__ . '/../Fixtures/prescription.php');
        DB::table('t_prescriptions')->insert([
            'id' => 2, 'name' => '度瘴散', 'cited' => '同名异方测试',
            'indications' => str_repeat('测试主治', 40), 'tags' => ' 解表/和营、解表；调和,调和，学习;学习',
        ]);
        DB::table('t_prescriptions')->insert(['id' => 3]);
    }

    public function test_list_uses_real_ids_totals_and_stable_pagination()
    {
        $this->assertSame('sqlite', (new Prescription())->getConnectionName());
        $this->getJson('/api/prescriptions?page_size=2')->assertOk()
            ->assertJsonPath('code', 0)->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.items.0.id', 1)->assertJsonPath('data.items.1.id', 2)
            ->assertJsonPath('data.items.0.title', '度瘴散')
            ->assertJsonPath('data.items.1.title', '度瘴散')
            ->assertJsonPath('data.items.0.source', '外台秘要')
            ->assertJsonPath('data.items.0.tags', [])
            ->assertJsonPath('data.has_more', true);
        $this->getJson('/api/prescriptions?page=2&page_size=2')->assertOk()
            ->assertJsonPath('data.items.0.id', 3)->assertJsonPath('data.has_more', false);
        $this->getJson('/api/prescriptions?page=8')->assertOk()->assertJsonCount(0, 'data.items');
    }

    public function test_search_supports_all_planned_fields_and_multiple_terms()
    {
        foreach (['度瘴散 外台秘要', 'dzsjdyy', '麻黄', '辛开苦降', '疗伤寒', '外台秘要'] as $keyword) {
            $this->getJson('/api/prescriptions?' . http_build_query(['keyword' => $keyword]))
                ->assertOk()->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.id', 1);
        }
        $this->getJson('/api/prescriptions?' . http_build_query(['keyword' => '调和']))
            ->assertOk()->assertJsonPath('data.items.0.id', 2);
        $this->getJson('/api/prescriptions?keyword=missing')->assertOk()
            ->assertJsonPath('data.total', 0)->assertJsonCount(0, 'data.items');
        $this->getJson('/api/prescriptions?keyword=%20%20')->assertOk()->assertJsonPath('data.total', 3);
    }

    public function test_detail_preserves_entire_source_text_and_newlines()
    {
        $source = require __DIR__ . '/../Fixtures/prescription.php';
        $response = $this->getJson('/api/prescriptions/1')->assertOk();
        foreach (['modern_dose', 'decoction', 'indications', 'explanation'] as $field) {
            $response->assertJsonPath('data.' . $field, $source[$field]);
        }
        $original = "第一行\r\n第二行\n\n第三行";
        DB::table('t_prescriptions')->where('id', 1)->update(['decoction' => $original]);
        $this->getJson('/api/prescriptions/1')->assertJsonPath('data.decoction', $original);
    }

    public function test_null_fields_tags_and_summary_are_normalized_without_inventing_content()
    {
        $this->getJson('/api/prescriptions/3')->assertOk()
            ->assertJsonPath('data.title', '未命名处方')->assertJsonPath('data.source', '')
            ->assertJsonPath('data.tags', [])->assertJsonPath('data.modern_dose', null);
        $this->getJson('/api/prescriptions/2')->assertOk()
            ->assertJsonPath('data.tags', ['解表', '和营', '调和', '学习'])
            ->assertJsonPath('data.summary', str_repeat('测试主治', 30) . '…');
    }

    public function test_invalid_or_missing_id_never_returns_the_first_prescription()
    {
        foreach (['prescription-001', '-1', '4294967296', '1.5'] as $id) {
            $this->getJson('/api/prescriptions/' . $id)->assertStatus(422)->assertJsonPath('code', -1);
        }
        $this->getJson('/api/prescriptions/99')->assertStatus(404)->assertJsonPath('errorMsg', '未找到该处方');
        DB::table('t_prescriptions')->insert(['id' => 0, 'name' => '零号测试']);
        $this->getJson('/api/prescriptions/0')->assertOk()->assertJsonPath('data.id', 0);
    }

    public function test_pagination_and_search_parameters_are_validated()
    {
        foreach (['page=0', 'page_size=51', 'page_size=-1', 'page=1.2', 'keyword[]=x', 'keyword=' . str_repeat('a', 101)] as $query) {
            $this->getJson('/api/prescriptions?' . $query)->assertStatus(422)->assertJsonPath('code', -1);
        }
    }

    public function test_database_failure_is_a_safe_error_response()
    {
        Schema::drop('t_prescriptions');
        $response = $this->getJson('/api/prescriptions')->assertStatus(500)
            ->assertJsonPath('code', -1)->assertJsonPath('errorMsg', '处方加载失败，请稍后重试');
        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
        $this->getJson('/api/prescriptions/1')->assertStatus(500)->assertJsonPath('code', -1);
    }
}
