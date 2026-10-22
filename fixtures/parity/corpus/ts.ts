interface   Shape {width:number;height:number}
export function area(shape:Shape):number{return shape.width*shape.height}
export const   shapes: Array<Shape> = [{width:1,height:2},{width:3,height:4}]
