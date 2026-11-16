<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Throwable;

class CheckPersonal extends Command
{
    protected $signature = 'personal:check';
    protected $description = 'Check personal-module deployment prerequisites without printing credentials or modifying data';

    public function handle()
    {
        $ready = true;
        foreach (['appid', 'secret'] as $setting) {
            $present = (bool) config('personal.' . $setting);
            $this->line('WeChat ' . $setting . ': ' . ($present ? 'configured' : 'MISSING'));
            $ready = $ready && $present;
        }
        $this->line('Database connection: ' . config('database.default'));
        try {
            foreach (['users', 'sessions', 'records', 'feedback'] as $name) {
                $table = 't_personal_' . $name;
                $exists = Schema::hasTable($table);
                $this->line($table . ': ' . ($exists ? 'ready' : 'MISSING'));
                $ready = $ready && $exists;
            }
        } catch (Throwable $error) {
            $ready = false;
            $this->error('Database unavailable. Check the service network and MYSQL_* environment variables.');
        }
        $images = true;
        foreach (['cos_bucket', 'cos_region', 'cos_secret_id', 'cos_secret_key'] as $setting) $images = $images && (bool) config('personal.' . $setting);
        $this->line('Private screenshot storage: ' . ($images ? 'configured' : 'MISSING (text feedback remains available)'));
        $this->line('Also verify runtime INSERT/UPDATE/DELETE privileges and enable WechatSI in the mini-program console.');
        return $ready && $images ? 0 : 1;
    }
}
