# Classic Cases Database Deployment

The Laravel service reads `qingnang.t_cases` through the existing `MYSQL_*`
environment variables. Do not place database credentials in this repository.

Configure the CloudRun service with:

```text
MYSQL_ADDRESS=10.31.107.102:3306
MYSQL_DATABASE=qingnang
MYSQL_USERNAME=<read-only user>
MYSQL_PASSWORD=<read-only password>
```

Create the account using `cases-readonly-user.sql.example` after replacing its
placeholders. The account only needs `SELECT` on `qingnang.t_cases`.

Because an administrator password was previously shared in plaintext, rotate
that password before deployment.
