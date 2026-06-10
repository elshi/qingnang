<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Book extends Model
{
    protected $primaryKey = 'id';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'id' => 'integer',
    ];

    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);

        $this->setTable(config('database.books_table'));
    }

    public function chapters()
    {
        return $this->hasMany(BookChapter::class, config('database.book_chapter_book_id_field'));
    }
}
