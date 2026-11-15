<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Meridian extends Model
{
    protected $primaryKey = 'meridian_id';
    public $timestamps = false;
    public $incrementing = false;
    protected $guarded = ['meridian_id'];
    protected $casts = ['meridian_id' => 'integer'];

    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);
        $this->setConnection(config('database.meridians_connection'));
        $this->setTable(config('database.meridians_table'));
    }
}
