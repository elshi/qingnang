<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Acupoint extends Model
{
    protected $primaryKey = 'acupoint_id';
    public $timestamps = false;
    public $incrementing = false;
    protected $guarded = ['acupoint_id'];
    protected $casts = ['acupoint_id' => 'integer'];

    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);
        $this->setConnection(config('database.acupoints_connection'));
        $this->setTable(config('database.acupoints_table'));
    }
}
