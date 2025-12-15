# agent-99

[github](https://github.com/tonioloewald/agent-99/) | [live demo](https://tonioloewald.github.io/agent-99/) | [npm](https://www.npmjs.com/package/agent-99)

**blueprint src url** `https://tonioloewald.github.io/agent-99/dist/blueprint.js`

To create your own web-component blueprint, simply use `agent-99` thus:

```
npx agent-99 my-custom-element
```

> The example web-component is a toggle-switch.

```
<agent-99 id="basic" checked>
  <div slot="on">on</div>
  <div slot="off">off</div>
</agent-99>
```

## Loading a blueprint

If you just want to bundle the component…

```
import { makeComponent } from 'xinjs'
import blueprint from 'agent-99'

const { creator } = makeBlueprint( 'agent-99', blueprint )

document.body.append( creator() )
```

If you want to use a CDN:

```
<script type="module">
  import 'https://cdn.jsdelivr.net/npm/xinjs@0.7.1/dist/module.js'
</script>
<xin-loader>
  <xin-blueprint tag="agent-99" src="https://tonioloewald.github.io/agent-99/dist/blueprint.js"></xin-blueprint>
</xin-loader>
<agent-99></agent-99>
```

You can also use `<xin-loader>` and `<xin-blueprint>` or `makeComponent` to load blueprints at runtime.

## Development

This project is designed for use with [Bun](https://bun.sh).

The blueprint code is `./src/blueprint.ts` and unless it's complicated there's no reason
it can't all be in one source file.

`./index.html` exercises your blueprint.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun start
```

## Development

This project is designed for use with [Bun](https://bun.sh).

The blueprint code is `./src/blueprint.ts` and unless it's complicated there's no reason
it can't all be in one source file.

`./index.html` exercises your blueprint.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun start
```
