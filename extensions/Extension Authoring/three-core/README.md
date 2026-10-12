# Three core

The shared three.js scene the 3D chart extensions import: the renderer, an orbit camera, labels over the canvas, a tooltip, hover and click (a drag is never a click), a frame drawn only when something moves, round points by the million with screen-space picking, an axes box whose ticks follow the camera, and the theme's colours. A library: it adds no view of its own and is installed as a dependency of the 3D extensions, never on its own initiative.

## What it shows

Nothing to a result by itself. The 3D extensions (3D Bars, Scatter 3D, City 3D, Vector Space 3D) import from `$ext/three-core/three-core.plumesql.js` and draw with it, so a result showing several of them loads three.js once.

## What it exports

| Export | What it is |
|---|---|
| `THREE`, `OrbitControls` | three.js itself and its orbit controls, one copy for every 3D view |
| `createStage(root, ctx, opts)` | the scene of one draw: `renderer`, `scene`, `camera`, `controls`, `addLabel`, `tip`, `onPointer`, `onFrame`, `segments`, `legendRamp`, `legendCategories`, `setHome`, `reset`, `request`, `resize`, `dispose` |
| `makePoints`, `pointPicker`, `pointMarker` | a cloud of round points in one draw call, the point under the pointer, a ring around one point |
| `axesBox`, `axisScale` | the cube a cloud lives in with its three axes, a linear or log scale with its ticks |
| `themeOf(ctx)` | the colours to paint with: the curated set under Dark and Light, a theme extension's own roles (`ctx.palette`) under any other |
| `loadRows`, `num`, `fmtTick`, `ticks`, `colorRamp`, `rampRgb01`, `rgb01`, `esc`, `csvCell`, `colIndex`, `message` | rows paged in past the first window, numbers, ticks, colours, text |

A view keeps the stage of its last draw and disposes it before the next one, so no WebGL context is left behind:

```js
import { createStage, loadRows, message } from '$ext/three-core/three-core.plumesql.js'

let stage = null
export default {
  views: [{
    tab: 'My 3D',
    contextMenu: false,
    render: async (root, data, ctx) => {
      stage?.dispose()
      stage = createStage(root, ctx)
      // ... add meshes to stage.scene, labels with stage.addLabel ...
      stage.setHome([6, 5, 8], [0, 0, 0])
    },
    resize: (root, size) => {
      if (!stage || !stage.canvas.isConnected) throw new Error('no 3D scene to resize')
      stage.resize(size.width, size.height)
    }
  }]
}
```

## Requirements

PostgreSQL 13 or newer. Loads three.js from `cdn.jsdelivr.net` at run time; the host must be on the allowed remote script hosts (the page offers Allow). After the first load the copy is kept on this machine and works offline. A GPU-capable browser: the desktop app, or a normal browser tab.

## Notes

Removing a 3D extension keeps this one while another still needs it; it goes when the last one does.
