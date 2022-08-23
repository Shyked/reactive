import typescript from '@rollup/plugin-typescript'
import { terser } from 'rollup-plugin-terser'

export default {
  input: './src/Reactive.ts',
  output: {
    dir: './dist',
    format: 'umd',
    name: 'Reactive'
  },
  plugins: [typescript(), terser()]
}
