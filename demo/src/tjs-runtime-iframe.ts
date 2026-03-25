/**
 * TJS Runtime for iframe execution
 *
 * Built as a standalone script and loaded via <script src="tjs-runtime.js">
 * in playground iframes. This ensures the iframe gets the real runtime,
 * not a hand-maintained stub that drifts out of sync.
 */
import { installRuntime } from '../../src/lang/runtime'

installRuntime()
