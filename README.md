<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**

- [What is Reactive](#what-is-reactive)
- [How does that improve my code](#how-does-that-improve-my-code)
- [Example](#example)
- [Terminology](#terminology)
  - [Prop](#prop)
  - [Computed](#computed)
  - [Work](#work)
- [How to use](#how-to-use)
  - [Props: Define your data structure](#props-define-your-data-structure)
  - [Form Props: Sync your form with your data](#form-props-sync-your-form-with-your-data)
  - [Computeds: Define your dynamic data](#computeds-define-your-dynamic-data)
  - [Works: Define your data structure side effects](#works-define-your-data-structure-side-effects)
  - [TypeScript](#typescript)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# What is Reactive

Ever struggled having to keep your page and your forms synced with a
JavaScript data structure? When chaging a piece of data, you have to call this
and that function to keep your page up to date with it.

If you are not already using a popular framework dealing with reactivity, you
may be considering re-writing your app with one of these.

**"Reactive" is a small and standalone library that can introduce reactivity on
any project.**

# How does that improve my code

Without reactivity:
```
When A is updated, update C
When B is udpated, update C
The updated value of C is A+B
```

With reactivity:
```
The updated value of C is A+B
```

Reactive will read your function, understand that C is depends on A and B, and
will thus update C whenever A or B is updated.

# Example

Without Reactive:
```js
function updateFirstname (firstname) {
  profile.firstname = firstname;
  document.getElementById('profile-firstname').innerText = firstname;
  whenEitherUpdated()
}

function updateLastname (lastname) {
  profile.lastname = lastname;
  document.getElementById('profile-lastname').innerText = lastname;
  whenEitherUpdated()
}

function whenEitherUpdated () {
  document.getElementById('profile-fullname').innerText = profile.firstname + ' ' + profile.lastname
}

updateFirstname('John');
```

With Reactive:
```js
reactive.defineWorks([
  (prop) => document.getElementById('profile-firstname').innerText = prop.firstname,
  (prop) => document.getElementById('profile-lastname').innerText = prop.lastname,
  (prop) => document.getElementById('profile-fullname').innerText = prop.firstname + ' ' + prop.lastname,
])

reactive.prop.firstname = 'John'
```

Full demo and playground : https://codesandbox.io/s/reactive-demo-p30xwl?file=/src/index.js

# Terminology

## Prop

It is an object property that is constantly observed.
When edited, every Works that make use of this Prop will be re-run

## Computed

Computed properties are built and updated automatically from Props.
Each Computed relies on a function with no side effect that uses one or severals props to compute a new value

## Work

Functions with side effects. You can use a Work to update Props
or do whatever you want. When a Prop used by a Work is modified, the Work will be re-run.

# How to use

## Props: Define your data structure

```js
const reactive = new Reactive();

reactive.defineProps({
  firstname: 'John',
  lastname: 'Doe',
  company: {
    name: 'Acme'
  }
});
```

## Form Props: Sync your form with your data

```js
reactive.defineFormProps({
  // Standard inputs & selects
  firstname: { element: firstnameInput },

  // Using a custom library with custom getters/setters
  customSelect: {
    element: customSelect,
    accessors: {
      getter: (select) => {
        return getMySelectValue(select)
      },
      setter: (select, value) => {
        setMySelectValue(select, value)
      }
    }
  }
})
```

## Computeds: Define your dynamic data

```js
reacitve.defineComuteds({
  fullname: (prop) => prop.firstname + ' ' + prop.lastname
})
```

## Works: Define your data structure side effects

```js
reactive.defineWorks([
  // Short syntax
  (prop, computed) => document.getElementById('my-name').innerText = computed.fullname,

  // Descriptive syntax
  function syncFullname (prop, computed) {
    document.getElementById('my-name').innerText = computed.fullname
  }
])
```

## TypeScript

```ts
const reactive = new Reactive<{
  prop1: string
}, {
  computed1: string
}>()
```
