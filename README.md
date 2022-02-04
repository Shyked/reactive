PURPOSE
=======

Reactive properties allow to reverse how properties are linked together.
Instead of using events to say
  "When A has changed, then update B"
reactive properties do it this way:
  "B depends on A"

The Reactive will automatically re-build B when A is updated


TERMINOLOGY
===========

Prop:
  It is an object property that is constantly observed.
  When edited, every Works that make use of this Prop will be re-run

Computed:
  Computed properties are built and updated automatically from Props.
  Each Computed relies on a function with no side effect that uses one or severals props to compute a new value

Work:
  Functions with side effects. You can use a Work to update Props
  or do whatever you want. When a Prop used by a Work is modified, the Work will be re-run.

Linker:
  Links a Select or an Input Element to an existing prop.
  Editing the prop will change the Element value.
  When the Element value changes, the prop value will also be changed.


EXAMPLE
=======

```js
 let reactive = new Reactive({
   red: false,
   blue: false
 })

 reactive.defineComputed(
   'multicolor',
   prop => {
     return prop.red && prop.blue
   }
 )

 reactive.defineWork(
   (prop, computed) => {
     if (computed.multicolor) {
       console.log('RAINBOOOOW')
     }
   }
 )

 reactive.prop.red = true

 // Will display "RAINBOOOOW"
 reactive.prop.blue = true
```
