<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class BookChapter extends Model
{
    protected $primaryKey = 'id';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'id' => 'integer',
        'book_id' => 'integer',
    ];

    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);

        $this->setTable(config('database.book_chapters_table'));
    }
}
