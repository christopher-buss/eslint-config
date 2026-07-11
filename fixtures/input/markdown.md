# Test Document

Some introductory text.

## Code Samples

TypeScript with violations:

```ts
var x = 1
let y = "hello"
const obj = {z: 3, a: 1, m: 2}
if (x == 1) { console.log("equal") }
const arr = [1,2,3]
arr.forEach(function(item) { console.log(item) })
const power = Math.pow(2, 10)
const greeting = "hello " + "world"
```

JavaScript with violations:

```js
var a = 1
let b = "test"
if (a == b) { console.log("match") }
const result = [1,2,3].map(function(n) { return n * 2 })
eval("code")
```

## Section Two

More text content here.

```ts
const unused_import_test = 42
let mutable = "value"
const obj2 = {method: function() { return 1 }}
```

## Lists

- First item
- Second item
- Third item

## Links and Images

[Example Link](https://example.com)

![](missing-alt.png)
