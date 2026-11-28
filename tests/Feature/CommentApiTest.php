<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CommentApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        require_once database_path('migrations/2026_11_16_000000_create_personal_tables.php');
        require_once database_path('migrations/2026_11_28_000000_create_content_comments.php');
        (new \CreatePersonalTables())->up();
        (new \CreateContentComments())->up();
        foreach (['t_cases' => 'id', 't_prescriptions' => 'id', 't_meridians' => 'meridian_id', 't_acupoints' => 'acupoint_id'] as $table => $key) {
            Schema::create($table, function (Blueprint $table) use ($key) { $table->unsignedInteger($key)->primary(); });
            DB::table($table)->insert([$key => 1]);
        }
        Schema::create('t_books', function (Blueprint $table) { $table->unsignedInteger('id')->primary(); $table->string('name'); });
        Schema::create('t_book_chapters', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary(); $table->unsignedInteger('book_id');
            $table->string('title'); $table->text('content');
        });
        DB::table('t_books')->insert([['id' => 1, 'name' => '伤寒论'], ['id' => 2, 'name' => '金匮要略']]);
        DB::table('t_book_chapters')->insert([
            ['id' => 1, 'book_id' => 1, 'title' => '第1条', 'content' => '原文'],
            ['id' => 2, 'book_id' => 1, 'title' => '第2条', 'content' => '原文'],
        ]);
        foreach (['a', 'b'] as $user) {
            DB::table('t_personal_sessions')->insert(['owner_id' => str_repeat($user, 32),
                'token_hash' => hash('sha256', str_repeat($user, 64)), 'expires_at' => now()->addDay(), 'created_at' => now()]);
        }
    }

    private function auth(string $user = 'a'): array { return ['Authorization' => 'Bearer ' . str_repeat($user, 64)]; }
    private function payload(array $extra = []): array
    {
        return array_merge(['type' => 'chapter', 'id' => 1, 'chapterId' => 1, 'content' => '结合前后文理解。', 'submissionId' => 'first'], $extra);
    }
    private function publish(array $extra = [], string $user = 'a')
    {
        return $this->postJson('/api/personal/comments', $this->payload($extra), $this->auth($user));
    }

    public function test_comments_are_public_but_writes_require_a_valid_session()
    {
        $this->getJson('/api/comments?type=chapter&id=1&chapterId=1')->assertOk()->assertJsonPath('data.total', 0);
        $this->postJson('/api/personal/comments', $this->payload())->assertStatus(401);
        $this->publish()->assertOk()->assertJsonPath('data.mine', true);
        $public = $this->getJson('/api/comments?type=chapter&id=1&chapterId=1')->assertOk()
            ->assertJsonPath('data.items.0.mine', false)->json('data.items.0');
        $this->assertEquals(['id', 'author', 'mine', 'content', 'createdAt'], array_keys($public));
        $this->assertNotContains(str_repeat('a', 32), $public);
        $this->assertStringStartsWith('书友', $public['author']);
        $this->getJson('/api/personal/comments?type=chapter&id=1&chapterId=1', $this->auth())->assertOk()->assertJsonPath('data.items.0.mine', true);
        DB::table('t_personal_sessions')->update(['expires_at' => now()->subMinute()]);
        $this->publish(['submissionId' => 'expired'])->assertStatus(401);
    }

    public function test_targets_and_chapters_are_isolated_and_existing_content_is_required()
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        foreach (['book', 'case', 'prescription', 'meridian', 'acupoint'] as $type) {
            $this->publish(['type' => $type, 'chapterId' => null, 'submissionId' => $type])->assertOk();
            $this->getJson('/api/comments?type=' . $type . '&id=1')->assertOk()->assertJsonPath('data.total', 1);
            $this->publish(['type' => $type, 'id' => 999, 'chapterId' => null, 'submissionId' => $type . '-missing'])->assertStatus(404);
        }
        $this->publish()->assertOk();
        $this->publish(['chapterId' => 2, 'submissionId' => 'second'])->assertOk();
        $this->getJson('/api/comments?type=chapter&id=1&chapterId=1')->assertOk()->assertJsonPath('data.total', 1);
        $this->getJson('/api/comments?type=chapter&id=1&chapterId=2')->assertOk()->assertJsonPath('data.total', 1);
        $this->publish(['id' => 2, 'submissionId' => 'wrong-book'])->assertStatus(404);
        $this->publish(['chapterId' => 999, 'submissionId' => 'wrong-chapter'])->assertStatus(404);
    }

    public function test_retry_is_idempotent_and_cannot_change_the_original_submission()
    {
        $first = $this->publish()->assertOk()->json('data.id');
        $this->publish()->assertOk()->assertJsonPath('data.id', $first);
        $this->assertEquals(1, DB::table('t_content_comments')->count());
        $this->publish(['content' => '被改动的内容'])->assertStatus(409);
        $this->publish(['chapterId' => 2])->assertStatus(409);
        $this->publish([], 'b')->assertOk();
        $this->assertEquals(2, DB::table('t_content_comments')->count());
    }

    public function test_only_the_author_can_delete_and_retries_cannot_restore_deleted_comments()
    {
        $id = $this->publish()->assertOk()->json('data.id');
        $this->deleteJson('/api/personal/comments/' . $id)->assertStatus(401);
        $this->deleteJson('/api/personal/comments/' . $id, [], $this->auth('b'))->assertStatus(404);
        $this->deleteJson('/api/personal/comments/' . $id, [], $this->auth())->assertOk();
        $this->deleteJson('/api/personal/comments/' . $id, [], $this->auth())->assertOk();
        $this->getJson('/api/comments?type=chapter&id=1&chapterId=1')->assertOk()->assertJsonPath('data.total', 0)->assertJsonCount(0, 'data.items');
        $this->publish()->assertStatus(410);
        $this->assertSame('', DB::table('t_content_comments')->first()->content);
    }

    public function test_empty_oversize_and_invalid_targets_are_rejected()
    {
        foreach (['', '   ', "\n　\t", str_repeat('字', 1001)] as $content) $this->publish(['content' => $content])->assertStatus(422);
        foreach ([['type' => 'note'], ['chapterId' => null], ['id' => -1], ['type' => 'case'], ['submissionId' => 'bad/id']] as $extra) {
            $this->publish($extra)->assertStatus(422);
        }
        $this->assertEquals(0, DB::table('t_content_comments')->count());
        $this->publish(['content' => "　 学习心得 \n"])->assertOk()->assertJsonPath('data.content', '学习心得');
    }

    public function test_cursor_pagination_does_not_repeat_comments_when_new_ones_arrive()
    {
        for ($i = 1; $i <= 23; $i++) {
            DB::table('t_content_comments')->insert(['target_key' => 'chapter:1:1', 'owner_id' => str_repeat('a', 32),
                'submission_id' => 'seed-' . $i, 'content' => '点评' . $i, 'created_at' => now(), 'updated_at' => now()]);
        }
        $first = $this->getJson('/api/comments?type=chapter&id=1&chapterId=1')->assertOk()->assertJsonCount(20, 'data.items')->json('data');
        $this->assertSame('4', $first['cursor']);
        $this->publish()->assertOk();
        $next = $this->getJson('/api/comments?type=chapter&id=1&chapterId=1&cursor=' . $first['cursor'])
            ->assertOk()->assertJsonPath('data.total', 24)->assertJsonPath('data.cursor', '')->json('data.items');
        $this->assertSame(['3', '2', '1'], array_column($next, 'id'));
        $this->getJson('/api/comments?type=chapter&id=1&chapterId=1&cursor=-1')->assertStatus(422);
    }
}
