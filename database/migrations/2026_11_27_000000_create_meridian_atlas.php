<?php

use App\Support\MeridianAtlas;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;

class CreateMeridianAtlas extends Migration
{
    public function up()
    {
        $schema=MeridianAtlas::connection()->getSchemaBuilder();
        $schema->create(MeridianAtlas::table('t_meridian_atlas'),function(Blueprint $t){
            $t->unsignedInteger('meridian_id')->primary();
            $t->string('slug',32)->unique();
            $t->string('group_key',16);
            $t->unsignedSmallInteger('display_order');
            $t->text('payload');
        });
        $schema->create(MeridianAtlas::table('t_meridian_atlas_points'),function(Blueprint $t){
            $t->unsignedInteger('meridian_id');
            $t->unsignedInteger('acupoint_id');
            $t->string('kind',8);
            $t->string('point_code',16);
            $t->unsignedSmallInteger('display_order');
            $t->primary(['meridian_id','acupoint_id']);
            $t->unique(['meridian_id','display_order'], 'atlas_point_order');
        });
        $schema->create(MeridianAtlas::table('t_acupoint_review'),function(Blueprint $t){
            $t->unsignedInteger('acupoint_id')->primary();
            $t->text('sources');
        });
    }

    public function down()
    {
        $schema=MeridianAtlas::connection()->getSchemaBuilder();
        foreach (['t_acupoint_review','t_meridian_atlas_points','t_meridian_atlas'] as $name) $schema->dropIfExists(MeridianAtlas::table($name));
    }
}

