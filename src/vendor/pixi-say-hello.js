// Keep PixiJS's console banner out of the artifact. Besides being noise, its
// http:// link is a remote-looking string that MOSS's package scan would flag.
export function sayHello() {}
