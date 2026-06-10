<?php

namespace App\Http\Controllers;

use App\Book;
use App\BookChapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class BookController extends Controller
{
    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'dynasty' => 'nullable|string|max:50',
            'keyword' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return $this->error($validator->errors()->first(), 422);
        }

        try {
            $query = Book::query()->withCount('chapters');

            if ($request->filled('dynasty')) {
                $query->where('dynasty', trim($request->input('dynasty')));
            }

            if ($request->filled('keyword')) {
                $keyword = trim($request->input('keyword'));
                $query->where(function ($searchQuery) use ($keyword) {
                    $searchQuery->where('name', 'like', '%' . $keyword . '%')
                        ->orWhere('summary', 'like', '%' . $keyword . '%')
                        ->orWhere('author', 'like', '%' . $keyword . '%');
                });
            }

            $books = $query->orderBy('id')->get()->map(function (Book $book) {
                return $this->transformBook($book);
            })->values();

            return $this->success([
                'items' => $books,
                'dynasties' => $books->pluck('dynasty')->filter()->unique()->values(),
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error('医书列表加载失败，请稍后重试', 500);
        }
    }

    public function show($id)
    {
        if (!$this->validId($id)) {
            return $this->error('医书 ID 无效', 422);
        }

        try {
            $book = Book::query()->withCount('chapters')->find((int) $id);

            if (!$book) {
                return $this->error('未找到该医书', 404);
            }

            $data = $this->transformBook($book);
            $bookIdField = config('database.book_chapter_book_id_field');
            $titleField = config('database.book_chapter_title_field');
            $data['chapters'] = $book->chapters()
                ->select(['id', $bookIdField, $titleField])
                ->orderBy('id')
                ->get()
                ->map(function (BookChapter $chapter) use ($titleField) {
                    return [
                        'id' => $chapter->id,
                        'title' => $chapter->{$titleField} ?: '未命名章节',
                    ];
                })
                ->values();

            return $this->success($data);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error('医书详情加载失败，请稍后重试', 500);
        }
    }

    public function chapter($id, $chapterId)
    {
        if (!$this->validId($id) || !$this->validId($chapterId)) {
            return $this->error('章节 ID 无效', 422);
        }

        try {
            $bookIdField = config('database.book_chapter_book_id_field');
            $titleField = config('database.book_chapter_title_field');
            $contentField = config('database.book_chapter_content_field');
            $chapter = BookChapter::query()
                ->where($bookIdField, (int) $id)
                ->find((int) $chapterId);

            if (!$chapter) {
                return $this->error('未找到该章节', 404);
            }

            return $this->success([
                'id' => $chapter->id,
                'book_id' => (int) $chapter->{$bookIdField},
                'title' => $chapter->{$titleField} ?: '未命名章节',
                'content' => $chapter->{$contentField},
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error('章节内容加载失败，请稍后重试', 500);
        }
    }

    private function transformBook(Book $book): array
    {
        return [
            'id' => $book->id,
            'name' => $book->name,
            'summary' => $book->summary,
            'dynasty' => $book->dynasty,
            'author' => $book->author,
            'chapter_count' => (int) $book->chapters_count,
        ];
    }

    private function validId($id): bool
    {
        return ctype_digit((string) $id) && (int) $id > 0;
    }

    private function success($data)
    {
        return response()->json(['code' => 0, 'data' => $data]);
    }

    private function error(string $message, int $status)
    {
        return response()->json([
            'code' => -1,
            'errorMsg' => $message,
        ], $status);
    }
}
