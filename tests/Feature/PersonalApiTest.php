<?php

namespace Tests\Feature;

use App\Services\WeChatIdentity;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PersonalApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        require_once database_path('migrations/2026_11_16_000000_create_personal_tables.php');
        (new \CreatePersonalTables())->up();
        $this->app->instance(WeChatIdentity::class, new class extends WeChatIdentity {
            public function exchange(string $code): array
            {
                if ($code === 'invalid') throw new \RuntimeException('微信身份验证失败，请重新登录');
                return ['appid' => 'wx-test', 'openid' => 'openid-' . $code];
            }
        });
    }

    private function loginAs(string $code = 'reader'): array
    {
        return $this->postJson('/api/personal/session', ['code' => $code])->assertOk()->json('data');
    }

    private function headers(array $user): array { return ['Authorization' => 'Bearer ' . $user['token']]; }

    private function note(string $key = 'note:first', string $content = '饮食有节，起居有常。'): array
    {
        return ['key' => $key, 'kind' => 'note', 'title' => '阅读心得', 'content' => $content];
    }

    private function save(array $user, array $record, int $version = 0, string $mutation = 'test-mutation')
    {
        return $this->postJson('/api/personal/records', [
            'record' => $record, 'expectedVersion' => $version, 'mutationId' => $mutation,
        ], $this->headers($user));
    }

    public function test_login_uses_verified_identity_and_revokes_sessions()
    {
        $this->postJson('/api/personal/session', ['code' => 'invalid'])->assertStatus(503);
        $this->assertEquals(0, DB::table('t_personal_users')->count());
        $user = $this->loginAs();
        $this->assertEquals(substr(hash('sha256', 'wx-test:openid-reader'), 0, 32), $user['id']);
        $this->assertNotEquals($user['token'], DB::table('t_personal_sessions')->first()->token_hash);
        $this->getJson('/api/personal/session', $this->headers($user))->assertOk();
        $this->deleteJson('/api/personal/session', [], $this->headers($user))->assertOk();
        $this->getJson('/api/personal/records', $this->headers($user))->assertStatus(401);
    }

    public function test_anonymous_and_expired_sessions_cannot_read_or_write()
    {
        $this->getJson('/api/personal/records', ['X-WX-OPENID' => 'forged'])->assertStatus(401);
        $this->postJson('/api/personal/records', ['owner' => 'forged'])->assertStatus(401);
        $user = $this->loginAs();
        DB::table('t_personal_sessions')->update(['expires_at' => now()->subMinute()]);
        $this->save($user, $this->note())->assertStatus(401);
        $this->assertEquals(0, DB::table('t_personal_records')->count());
    }

    public function test_records_are_private_durable_and_idempotent()
    {
        $first = $this->loginAs('first');
        $second = $this->loginAs('second');
        $note = $this->note() + ['owner' => $second['id'], 'audio' => ['path' => 'cloud://should-not-be-saved']];
        $this->save($first, $note)->assertOk()->assertJsonPath('data.version', 1);
        $this->save($first, $note)->assertOk()->assertJsonPath('data.version', 1);
        $this->assertEquals(1, DB::table('t_personal_records')->where('kind', 'note')->count());
        $this->assertEquals($first['id'], DB::table('t_personal_records')->first()->owner_id);
        $this->assertStringNotContainsString('audio', DB::table('t_personal_records')->first()->payload);
        $this->getJson('/api/personal/records', $this->headers($second))->assertJsonCount(0, 'data.records');
        $newSession = $this->loginAs('first');
        $this->getJson('/api/personal/records', $this->headers($newSession))->assertJsonPath('data.records.0.content', $note['content']);
    }

    public function test_stale_writes_conflict_and_import_cannot_resurrect_deleted_notes()
    {
        $user = $this->loginAs();
        $this->save($user, $this->note())->assertOk();
        $this->save($user, $this->note('note:first', '新的理解'), 1, 'edit-two')->assertOk();
        $this->save($user, $this->note('note:first', '旧设备编辑'), 1, 'stale-edit')
            ->assertStatus(409)->assertJsonPath('data.current.content', '新的理解');
        $this->save($user, ['key' => 'note:first', 'kind' => 'note', 'deleted' => true], 2, 'delete-three')->assertOk();
        $this->postJson('/api/personal/import', ['records' => [$this->note()]], $this->headers($user))
            ->assertOk()->assertJsonPath('data.records.0.deleted', true);
    }

    public function test_cloud_drafts_keep_note_revision_and_note_validation_requires_text()
    {
        $user = $this->loginAs();
        $this->save($user, ['key' => 'draft:new', 'kind' => 'draft', 'title' => '', 'content' => '未完成', 'noteVersion' => 2])
            ->assertOk()->assertJsonPath('data.noteVersion', 2);
        $this->save($user, $this->note('note:empty', '') + ['audio' => ['path' => 'file.mp3']])->assertStatus(422);
        $this->save($user, ['key' => 'favorite:case:1', 'kind' => 'favorite', 'ref' => ['type' => 'case', 'id' => '2', 'title' => '医案']])->assertStatus(422);
        $this->postJson('/api/personal/records', ['record' => $this->note(), 'expectedVersion' => 0,
            'mutationId' => 'save-and-clear', 'draftKey' => 'draft:new'], $this->headers($user))->assertOk();
        $this->assertEquals(0, DB::table('t_personal_records')->where('kind', 'draft')->where('deleted', false)->count());
    }

    public function test_history_clear_does_not_delete_notes_or_other_users_records()
    {
        $user = $this->loginAs();
        $other = $this->loginAs('other');
        $history = ['key' => 'history:chapter:7:1', 'kind' => 'history',
            'ref' => ['type' => 'chapter', 'id' => '7', 'chapterId' => '1', 'title' => '上古天真论'], 'scrollTop' => 250, 'contentMode' => 'shiyi'];
        $this->save($user, $history)->assertOk();
        $this->save($other, $history)->assertOk();
        $this->save($user, $this->note(), 0, 'note-save')->assertOk();
        $this->deleteJson('/api/personal/history', [], $this->headers($user))->assertOk();
        $this->assertEquals(1, DB::table('t_personal_records')->where('kind', 'history')->where('deleted', false)->count());
        $this->assertEquals(1, DB::table('t_personal_records')->where('kind', 'note')->where('deleted', false)->count());
    }

    public function test_feedback_retries_do_not_duplicate_and_foreign_images_are_rejected()
    {
        $user = $this->loginAs();
        $data = ['id' => 'feedback-1', 'type' => '产品建议', 'content' => '希望增加阅读字号设置', 'contact' => '', 'images' => []];
        $this->postJson('/api/personal/feedback', $data, $this->headers($user))->assertOk();
        $this->postJson('/api/personal/feedback', $data, $this->headers($user))->assertOk();
        $this->assertEquals(1, DB::table('t_personal_feedback')->count());
        $data['id'] = 'feedback-2';
        $data['images'] = ['personal/another-user/feedback/image.jpg'];
        $this->postJson('/api/personal/feedback', $data, $this->headers($user))->assertStatus(422);
    }
}
