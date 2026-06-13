# Classic Books Database Deployment

The Laravel service reads these tables by default:

```text
qingnang.t_books
qingnang.t_book_chapters
```

Required `t_books` fields:

```text
id, name, summary, dynasty, author
```

The default `t_book_chapters` fields are:

```text
id, book_id, title, content
```

The API also detects common alternatives such as `chapter_id`, `bookid`,
`chapter_title`, and `chapter_content`. Explicit environment configuration
takes precedence when the table uses other names.

Optional chapter fields:

```text
volume, shiyi
```

When either optional field is absent, the API returns `null` for that field.

If the chapter table uses different field names, configure the CloudRun
service without changing application code:

```text
BOOK_CHAPTER_BOOK_ID_FIELD=book_id
BOOK_CHAPTER_TITLE_FIELD=title
BOOK_CHAPTER_CONTENT_FIELD=content
BOOK_CHAPTER_VOLUME_FIELD=volume
BOOK_CHAPTER_SHIYI_FIELD=shiyi
```

Table names can also be overridden:

```text
BOOKS_TABLE=qingnang.t_books
BOOK_CHAPTERS_TABLE=qingnang.t_book_chapters
```

The database account used by CloudRun only needs `SELECT` permission on both
tables. The grants are included in `cases-readonly-user.sql.example`.
