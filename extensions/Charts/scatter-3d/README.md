# Scatter 3D

![Scatter 3D: Three numbers at once: every row a point in 3D, coloured and sized by two more columns; orbit, spin, hover and click (three.js)](media/scatter-3d.webp)

Three numbers at once: every row a point in 3D, a fourth column as its colour and a fifth as its size. Orbit, zoom and pan with the mouse, let it spin to read the depth, hover a point to name it, click it to select its row (three.js, through the Three core extension, which installs with it).

## What it shows

A **Scatter 3D** tab beside the grid. Each row becomes a point at its X, Y and Z, inside a box whose axes keep their ticks on the side that faces you as the camera turns. A two-dimensional scatter shows how two numbers go together; this one shows the third as well, so a group that only stands apart on the third number stops hiding behind the others.

- **Colour by** a category gives each of the twelve most frequent values a colour of its own (the rest share a muted one), and the legend's entries hide and show their points with a click. A number paints along the theme's ramp instead.
- **Size by** a number grows each point with it (by the square root, so the area reads in proportion).
- **Log** scales spread a column that spans orders of magnitude (calls, bytes, durations); a log axis leaves out what is not positive, and the Log says how many rows that was.

Drag with the left button to orbit, with the right button (or Shift and drag) to pan, and wheel to zoom; the arrow keys pan once the chart has focus. **Spin** in the header turns the cloud slowly, which is what makes its depth readable; a press on the chart stops it. Double-click, Home or 0, or **Reset camera** brings the camera back. All points are one draw call, so a few hundred thousand of them still turn smoothly.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| X, Y, Z | `x`, `y`, `z` | asked | The three numbers, along the width, the height and the depth |
| Colour by | `color` | none | A category (a colour each) or a number (a ramp) |
| Size by | `size` | none | A number the point grows with |
| Label | `label` | none | What the tooltip names a point by |
| X, Y, Z scale | `xScale`, `yScale`, `zScale` | linear | `linear` or `log` |
| Top rows | `top` | 200000 | How many rows the view reads from the result, from the first one |

## Example

Customers in three numbers, from the [dvdrental](https://neon.com/postgresql/postgresql-getting-started/postgresql-sample-database) sample database: how often they rent, how much they spend and how long they keep a film, coloured by their spending quarter.

```sql
-- @extension scatter-3d open
-- @inputs x=rentals, y=spent, z=avg_days_kept, color=segment, size=spent, label=customer
select c.first_name || ' ' || c.last_name as customer,
       count(*) as rentals,
       sum(p.amount) as spent,
       round(avg(r.return_date::date - r.rental_date::date), 1) as avg_days_kept,
       case ntile(4) over (order by sum(p.amount) desc)
         when 1 then 'top quarter' when 2 then 'second' when 3 then 'third' else 'bottom quarter' end as segment
from customer c
join payment p using (customer_id)
join rental r using (rental_id)
group by c.customer_id;
```

The same idea on your own orders is RFM segmentation: the days since the last order (recency), the number of orders (frequency) and what they came to (monetary), one point per customer.

The Query landscape extension (Performance) opens the server's statements in this view: calls, mean time and rows per call on log axes.

## Requirements

PostgreSQL 13 or newer. Nothing on the server: the view runs in the result's sandbox. A GPU-capable browser: the desktop app, or a normal browser tab. three.js comes from `cdn.jsdelivr.net`, which has to be an allowed remote script host (the Log offers Allow host when it is not); after the first load it is kept on this machine and works offline.

## Notes

Rows missing a number on an axis are left out, and the Log says how many. Labels are drawn over the canvas, so Copy as Image gives the points without their labels. Attach it from a script with `-- @extension scatter-3d` above a query (add `open`, `only` or `beside` to open on the view), or from a result's own menu; `-- @inputs` answers the inputs in the file so the chart draws with no dialog.
