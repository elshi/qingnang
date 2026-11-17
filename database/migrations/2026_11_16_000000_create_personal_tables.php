<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePersonalTables extends Migration
{
    public function up()
    {
        Schema::create('t_personal_users', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('appid', 64);
            $table->string('openid', 128);
            $table->timestamps();
        });
        Schema::create('t_personal_sessions', function (Blueprint $table) {
            $table->string('token_hash', 64)->primary();
            $table->string('owner_id', 32)->index();
            $table->dateTime('expires_at')->index();
            $table->dateTime('created_at');
        });
        Schema::create('t_personal_records', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('owner_id', 32);
            $table->string('record_hash', 64);
            $table->string('record_key', 512);
            $table->string('kind', 16);
            $table->longText('payload');
            $table->unsignedInteger('revision')->default(1);
            $table->string('mutation_id', 80);
            $table->boolean('deleted')->default(false);
            $table->timestamps();
            $table->unique(['owner_id', 'record_hash'], 'personal_owner_key_unique');
            $table->index(['owner_id', 'kind', 'deleted'], 'personal_owner_kind');
        });
        Schema::create('t_personal_feedback', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('owner_id', 32);
            $table->string('submission_id', 80);
            $table->string('type', 32);
            $table->text('content');
            $table->string('contact', 120)->nullable();
            $table->text('images');
            $table->timestamps();
            $table->unique(['owner_id', 'submission_id'], 'personal_feedback_unique');
        });
    }

    public function down()
    {
        Schema::dropIfExists('t_personal_feedback');
        Schema::dropIfExists('t_personal_records');
        Schema::dropIfExists('t_personal_sessions');
        Schema::dropIfExists('t_personal_users');
    }
}
