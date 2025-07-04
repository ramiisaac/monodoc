import { deepMerge } from "../deepMerge";

describe("deepMerge", () => {
  it("should merge two simple objects", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: 3, d: 4 };
    const result = deepMerge(obj1, obj2);
    
    expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("should merge nested objects", () => {
    const obj1 = { a: { x: 1, y: 2 }, b: 3 };
    const obj2 = { a: { z: 4 }, c: 5 };
    const result = deepMerge(obj1, obj2);
    
    expect(result).toEqual({ a: { x: 1, y: 2, z: 4 }, b: 3, c: 5 });
  });

  it("should handle arrays", () => {
    const obj1 = { a: [1, 2], b: 3 };
    const obj2 = { a: [3, 4], c: 5 };
    const result = deepMerge(obj1, obj2);
    
    expect(result).toEqual({ a: [3, 4], b: 3, c: 5 });
  });

  it("should override primitive values", () => {
    const obj1 = { a: 1, b: "old" };
    const obj2 = { a: 2, b: "new" };
    const result = deepMerge(obj1, obj2);
    
    expect(result).toEqual({ a: 2, b: "new" });
  });

  it("should handle null and undefined", () => {
    const obj1 = { a: 1, b: null };
    const obj2 = { a: undefined, c: 3 };
    const result = deepMerge(obj1, obj2);
    
    expect(result).toEqual({ a: undefined, b: null, c: 3 });
  });

  it("should handle empty objects", () => {
    const obj1 = {};
    const obj2 = { a: 1 };
    const result = deepMerge(obj1, obj2);
    
    expect(result).toEqual({ a: 1 });
  });

  it("should not mutate original objects", () => {
    const obj1 = { a: { x: 1 } };
    const obj2 = { a: { y: 2 } };
    const result = deepMerge(obj1, obj2);
    
    expect(obj1).toEqual({ a: { x: 1 } });
    expect(obj2).toEqual({ a: { y: 2 } });
    expect(result).toEqual({ a: { x: 1, y: 2 } });
  });
});