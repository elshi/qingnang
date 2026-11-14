<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Prescription extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $guarded = ['id'];
    protected $casts = ['id' => 'integer'];

    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);
        $this->setConnection(config('database.prescriptions_connection'));
        $this->setTable(config('database.prescriptions_table'));
    }
}
