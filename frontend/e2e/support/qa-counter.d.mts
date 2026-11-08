export class QaCounter {
  increment(key: string | number): void;
  readonly size: number;
  total(): number;
  toJSON(): Record<string, number>;
}
