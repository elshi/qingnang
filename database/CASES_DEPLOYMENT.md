# Classic Cases Database Deployment

The Laravel service reads `qingnang.t_cases` through the application's default
database connection. The default MySQL database is `qingnang`, and the
connection supports either `DATABASE_URL` or the existing `MYSQL_*`
environment variables. Do not place database credentials in this repository.

Configure the CloudRun service with:

```text
MYSQL_ADDRESS=10.31.107.102:3306
MYSQL_DATABASE=qingnang
MYSQL_USERNAME=<read-only user>
MYSQL_PASSWORD=<read-only password>
```

Set `CASES_TABLE` only when the cases table is stored elsewhere:

```text
CASES_TABLE=other_database.other_table
MYSQL_DATABASE=other_database
```

`CASES_DB_CONNECTION` normally does not need to be set. It is available only
when cases must use a preconfigured Laravel connection instead of
the application's default connection.

Create the account using `cases-readonly-user.sql.example` after replacing its
placeholders. The account only needs `SELECT` on `qingnang.t_cases`.

Because an administrator password was previously shared in plaintext, rotate
that password before deployment.
