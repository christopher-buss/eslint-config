# Test Document

Some introductory text.

## Code Samples

TypeScript with violations:

```ts
const x = 1
const y = "hello"
const object = {z: 3, a: 1, m: 2}
if (x == 1) { console.log("equal") }
const array = [1,2,3]
for (const item of array) { console.log(item) }
const power = 2**10
const greeting = 'hello world'
```

JavaScript with violations:

```js
const a = 1
const b = "test"
if (a == b) { console.log("match") }
const result = [1,2,3].map((n) => { return n * 2 })
eval("code")
```

## Section Two

More text content here.

```ts
const unused_import_test = 42
const mutable = "value"
const object2 = {method: function() { return 1 }}
export const inst = { fn: () => 0 }
```

## Lists

- First item
- Second item
- Third item

## Links and Images

[Example Link](https://example.com)

![](missing-alt.png)

## Non-code fences

A markdown fence (creates a virtual `*.md/*.md` file):

```markdown
# Nested heading

Some nested prose.
```

A json fence:

```json
{ "b": 2, "a": 1 }
```

A shell fence:

```sh
echo "hello"
```
