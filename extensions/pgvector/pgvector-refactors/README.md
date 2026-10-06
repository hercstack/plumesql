# pgvector refactors

The nearest neighbour query is the one everybody writes by hand. On a `SELECT` over a table with a vector column, the editor's lightbulb (Ctrl+. or ⌘.) writes it for you: an `ORDER BY` the distance to a vector and a `LIMIT`.

```sql
select id, content from items
order by embedding <=> $query::vector
limit 10;
```

## What it offers

**Order by nearest**, in the three distances pgvector indexes: L2 distance (`<->`), cosine distance (`<=>`) and inner product (`<#>`), one offer per vector column (`vector`, `halfvec` or `sparsevec`, cast to match). `$query` is a run parameter: PlumeSQL asks for it when you run the query, so paste the vector (`[0.1, 0.2, ...]`) there. The offer appears only on a query without an `ORDER BY` or a `LIMIT` of its own.

## Where it applies

In the SQL editor, wherever the extension is attached (everywhere from the install on; change it on its page). It reads only the statement and its tables' columns from PlumeSQL's dictionary, so nothing is asked of the server until you run the query. Reading vector values in a result is the **pgvector** extension's: install that one too, and attach each where you want it.

## Requirements

PostgreSQL 13 or newer with pgvector (`create extension vector`), and PlumeSQL 0.23.0 or newer.
