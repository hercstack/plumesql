# City 3D

![City 3D: A treemap you walk around: rows as buildings in districts, a number as the footprint, another as the height, a third as the colour](media/city-3d.webp)

A treemap you can walk around: every row a building, grouped into districts, its footprint by one number, its height by another and its colour by a third. Orbit, zoom and pan with the mouse, hover a building to read it, click it to select its row (three.js, through the Three core extension, which installs with it).

## What it shows

A **City 3D** tab beside the grid. The districts share the ground out in proportion to their total, the buildings share their district out in proportion to their own number (a squarified treemap, so every plot stays close to a square), and each rises with its height. A flat treemap answers "where is the most"; the city adds "and which of those is also the worst", in one picture: the problem is the building that is both wide and tall.

- **Colour by** a number runs along a ramp: `ramp` from blue to red for a plain magnitude, `alarm` from green to red where high is bad. A building with no value for it is muted. A category gives each of the twelve most frequent values a colour; with nothing picked, each district has its own.
- The districts are named on their ground, the largest buildings on their roofs, every building in its tooltip.

Drag with the left button to orbit, with the right button (or Shift and drag) to pan, and wheel to zoom. **Spin** turns the city slowly, **Reset camera** (or a double-click, Home, 0) brings the camera back, **Copy data** copies the buildings as CSV.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| Footprint | `area` | asked | The number a building covers ground in proportion to |
| Footprint scale | `areaScale` | linear | `linear` keeps the ground in proportion; `sqrt` keeps the order but lets the small buildings be seen beside a giant |
| District | `district` | none | The category buildings group into |
| Name | `name` | none | What a building is called |
| Height | `height` | none | The number a building rises with |
| Colour by | `color` | none | A number (along the ramp) or a category |
| Colour ramp | `ramp` | ramp | `ramp` (blue, amber, red) or `alarm` (green, amber, red) |
| Top rows | `top` | 20000 | How many rows the view reads from the result, from the first one |

## Example

Film revenue in the [dvdrental](https://neon.com/postgresql/postgresql-getting-started/postgresql-sample-database) sample database: a district per category, a building per film, its footprint what it earned, its height how often it was rented, its colour its rental rate.

```sql
-- @extension city-3d open
-- @inputs district=category, name=title, area=revenue, height=rentals, color=rental_rate
select c.name as category, f.title, sum(p.amount) as revenue, count(*) as rentals, f.rental_rate
from payment p
join rental r using (rental_id)
join inventory i using (inventory_id)
join film f using (film_id)
join film_category fc using (film_id)
join category c using (category_id)
group by c.name, f.film_id;
```

The Storage city extension (Storage and Maintenance) opens a database's tables in this view: schemas as districts, size as the footprint, dead rows as the height, vacuum age as the colour.

## Requirements

PostgreSQL 13 or newer. Nothing on the server: the view runs in the result's sandbox. A GPU-capable browser: the desktop app, or a normal browser tab. three.js comes from `cdn.jsdelivr.net`, which has to be an allowed remote script host (the Log offers Allow host when it is not); after the first load it is kept on this machine and works offline.

## Notes

Rows with no positive footprint are left out, and the Log says how many. Labels are drawn over the canvas, so Copy as Image gives the city without its labels. Attach it from a script with `-- @extension city-3d` above a query (add `open`, `only` or `beside` to open on the view), or from a result's own menu; `-- @inputs` answers the inputs in the file so the city draws with no dialog.
