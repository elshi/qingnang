<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CaseApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('t_cases', function (Blueprint $table) {
            $table->increments('id');
            $table->string('diseases', 200)->default('');
            $table->string('symptoms', 2000)->nullable();
            $table->string('subject', 10)->nullable();
            $table->string('doctor', 10)->nullable();
            $table->string('dynasty', 10)->nullable();
            $table->string('bookname', 30)->nullable();
            $table->text('content')->nullable();
            $table->string('origin_symptoms', 2000)->nullable();
            $table->string('temp_tags', 200)->nullable();
            $table->string('modern_prescription', 6000)->nullable();
            $table->decimal('confidence', 10, 1)->default(0);
            $table->string('summary', 2000)->nullable();
            $table->string('method', 1000)->nullable();
            $table->string('course_days', 50)->nullable();
        });

        DB::table('t_cases')->insert([
            [
                'id' => 1,
                'diseases' => '太阳中风',
                'symptoms' => '发热汗出，恶风。',
                'subject' => '内科',
                'doctor' => '张仲景',
                'dynasty' => '东汉',
                'bookname' => '伤寒论',
                'content' => str_repeat('太阳中风原文', 20),
                'origin_symptoms' => '太阳中风，阳浮而阴弱。',
                'temp_tags' => '太阳病/桂枝汤、太阳病',
                'modern_prescription' => '桂枝、芍药。',
                'confidence' => 91.5,
                'summary' => '调和营卫。',
                'method' => '解肌发表',
                'course_days' => '3天',
            ],
            [
                'id' => 2,
                'diseases' => '湿热咳嗽',
                'symptoms' => null,
                'subject' => '内科',
                'doctor' => '叶天士',
                'dynasty' => '清',
                'bookname' => '临证指南医案',
                'content' => '湿热蕴肺。',
                'origin_symptoms' => null,
                'temp_tags' => '湿热;咳嗽',
                'modern_prescription' => null,
                'confidence' => 75.0,
                'summary' => '轻清宣化。',
                'method' => '宣肺',
                'course_days' => null,
            ],
            [
                'id' => 3,
                'diseases' => '头痛/眩晕',
                'symptoms' => '头痛反复。',
                'subject' => '内科',
                'doctor' => '张仲景',
                'dynasty' => '东汉',
                'bookname' => '伤寒论',
                'content' => '头痛医案。',
                'origin_symptoms' => null,
                'temp_tags' => null,
                'modern_prescription' => null,
                'confidence' => 98.0,
                'summary' => null,
                'method' => null,
                'course_days' => null,
            ],
        ]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('t_cases');
        parent::tearDown();
    }

    public function test_list_is_paginated_and_sorted_by_confidence()
    {
        $response = $this->getJson('/api/cases?page_size=2');

        $response->assertOk()
            ->assertJsonPath('code', 0)
            ->assertJsonPath('data.items.0.id', 3)
            ->assertJsonPath('data.items.0.title', '张仲景 · 头痛 眩晕')
            ->assertJsonPath('data.items.1.id', 1)
            ->assertJsonPath('data.items.1.symptoms', '发热汗出，恶风。')
            ->assertJsonPath('data.items.1.symptom_tags.0', '发热汗出')
            ->assertJsonPath('data.items.1.symptom_tags.1', '恶风。')
            ->assertJsonPath('data.items.1.content_preview', mb_substr(str_repeat('太阳中风原文', 20), 0, 40) . '...')
            ->assertJsonPath('data.has_more', true)
            ->assertJsonPath('data.total', 3);
    }

    public function test_list_supports_keyword_and_faceted_filters()
    {
        $this->getJson('/api/cases?keyword=桂枝汤')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', 1);

        $this->getJson('/api/cases?doctor=张仲景&bookname=伤寒论')
            ->assertOk()
            ->assertJsonCount(2, 'data.items');
    }

    public function test_facets_return_counts()
    {
        $this->getJson('/api/cases/facets')
            ->assertOk()
            ->assertJsonPath('data.doctors.0.name', '张仲景')
            ->assertJsonPath('data.doctors.0.case_count', 2)
            ->assertJsonPath('data.books.0.name', '伤寒论')
            ->assertJsonPath('data.books.0.case_count', 2);
    }

    public function test_detail_transforms_all_fields_and_tags()
    {
        $this->getJson('/api/cases/1')
            ->assertOk()
            ->assertJsonPath('data.title', '张仲景 · 太阳中风')
            ->assertJsonPath('data.source', '伤寒论')
            ->assertJsonPath('data.tags.0', '太阳病')
            ->assertJsonPath('data.tags.1', '桂枝汤')
            ->assertJsonPath('data.analysis', '调和营卫。')
            ->assertJsonPath('data.modern_prescription', '桂枝、芍药。');
    }

    public function test_detail_returns_not_found_and_invalid_id_errors()
    {
        $this->getJson('/api/cases/999')
            ->assertStatus(404)
            ->assertJsonPath('code', -1);

        $this->getJson('/api/cases/not-a-number')
            ->assertStatus(422)
            ->assertJsonPath('code', -1);
    }

    public function test_list_validates_pagination_parameters()
    {
        $this->getJson('/api/cases?page=0&page_size=51')
            ->assertStatus(422)
            ->assertJsonPath('code', -1);
    }
}
