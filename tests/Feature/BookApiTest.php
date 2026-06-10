<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class BookApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('t_books', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->text('summary')->nullable();
            $table->string('dynasty')->nullable();
            $table->string('author')->nullable();
        });

        Schema::create('t_book_chapters', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('book_id');
            $table->string('title');
            $table->text('content')->nullable();
        });

        DB::table('t_books')->insert([
            ['id' => 1, 'name' => '伤寒论', 'summary' => '辨证论治经典。', 'dynasty' => '汉', 'author' => '张仲景'],
            ['id' => 2, 'name' => '温病条辨', 'summary' => '温病学经典。', 'dynasty' => '清', 'author' => '吴鞠通'],
        ]);

        DB::table('t_book_chapters')->insert([
            ['id' => 1, 'book_id' => 1, 'title' => '辨太阳病脉证并治', 'content' => '太阳之为病，脉浮。'],
            ['id' => 2, 'book_id' => 1, 'title' => '辨阳明病脉证并治', 'content' => '阳明之为病。'],
        ]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('t_book_chapters');
        Schema::dropIfExists('t_books');
        parent::tearDown();
    }

    public function test_list_returns_books_dynasties_and_chapter_counts()
    {
        $this->getJson('/api/books')
            ->assertOk()
            ->assertJsonPath('code', 0)
            ->assertJsonPath('data.items.0.name', '伤寒论')
            ->assertJsonPath('data.items.0.chapter_count', 2)
            ->assertJsonPath('data.dynasties.0', '汉');
    }

    public function test_list_supports_dynasty_and_keyword_filters()
    {
        $this->getJson('/api/books?dynasty=清')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.name', '温病条辨');

        $this->getJson('/api/books?keyword=张仲景')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', 1);
    }

    public function test_detail_returns_chapter_directory()
    {
        $this->getJson('/api/books/1')
            ->assertOk()
            ->assertJsonPath('data.name', '伤寒论')
            ->assertJsonCount(2, 'data.chapters')
            ->assertJsonPath('data.chapters.0.title', '辨太阳病脉证并治');
    }

    public function test_chapter_returns_content_and_must_belong_to_book()
    {
        $this->getJson('/api/books/1/chapters/1')
            ->assertOk()
            ->assertJsonPath('data.content', '太阳之为病，脉浮。');

        $this->getJson('/api/books/2/chapters/1')
            ->assertStatus(404)
            ->assertJsonPath('code', -1);
    }

    public function test_list_still_returns_books_when_chapter_table_is_unavailable()
    {
        Schema::drop('t_book_chapters');

        $this->getJson('/api/books')
            ->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.items.0.chapter_count', 0);
    }

    public function test_chapters_support_common_alternative_field_names()
    {
        Schema::drop('t_book_chapters');
        Schema::create('t_book_chapters', function (Blueprint $table) {
            $table->increments('chapter_id');
            $table->unsignedInteger('bookid');
            $table->string('chapter_title');
            $table->text('chapter_content')->nullable();
        });
        DB::table('t_book_chapters')->insert([
            [
                'chapter_id' => 8,
                'bookid' => 1,
                'chapter_title' => '替代字段章节',
                'chapter_content' => '替代字段正文',
            ],
        ]);

        $this->getJson('/api/books/1')
            ->assertOk()
            ->assertJsonPath('data.chapters.0.id', 8)
            ->assertJsonPath('data.chapters.0.title', '替代字段章节');

        $this->getJson('/api/books/1/chapters/8')
            ->assertOk()
            ->assertJsonPath('data.content', '替代字段正文');
    }
}
