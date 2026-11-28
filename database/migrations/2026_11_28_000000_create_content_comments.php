<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateContentComments extends Migration
{
    public function up()
    {
        Schema::create('t_content_comments', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('target_key', 100);
            $table->string('owner_id', 32);
            $table->string('submission_id', 80);
            $table->text('content');
            $table->boolean('deleted')->default(false);
            $table->timestamps();
            $table->index(['target_key', 'deleted', 'id'], 'comments_target_page');
            $table->unique(['owner_id', 'submission_id'], 'comments_owner_submission');
        });
    }

    public function down()
    {
        Schema::dropIfExists('t_content_comments');
    }
}
