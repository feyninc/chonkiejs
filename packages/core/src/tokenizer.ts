/** Maximum number of code points passed to a single `String.fromCodePoint` call. */
const DECODE_SLICE_SIZE = 8192;

/**
 * Simple character-based tokenizer for text chunking.
 *
 * This tokenizer treats each character as a single token, providing
 * a straightforward and predictable tokenization strategy.
 *
 * For advanced tokenization (GPT-2, BERT, etc.), use the static `create()` method
 * with @chonkiejs/token package installed.
 */
export class Tokenizer {
  /**
   * Create a tokenizer instance.
   *
   * @param model - Tokenizer model to use. Use 'character' (default) for character-based,
   *                or specify a HuggingFace model like 'gpt2', 'bert-base-uncased', etc.
   * @returns Promise resolving to a Tokenizer instance
   *
   * @example
   * // Character-based (no dependencies)
   * const tokenizer = await Tokenizer.create();
   * const tokenizer = await Tokenizer.create('character');
   *
   * @example
   * // HuggingFace models (requires @chonkiejs/token)
   * const tokenizer = await Tokenizer.create('gpt2');
   * const tokenizer = await Tokenizer.create('Xenova/gpt-4');
   */
  static async create(model: string = 'character'): Promise<Tokenizer> {
    if (model === 'character') {
      return new Tokenizer();
    }

    // Try to dynamically import @chonkiejs/token
    try {
      // Use dynamic import with string to avoid TypeScript resolution
      const tokenPackage = await import('@chonkiejs/token' as any);
      const { HuggingFaceTokenizer } = tokenPackage;
      return await HuggingFaceTokenizer.create(model);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';

      // Check if it's a module not found error
      if (errorMessage.includes('Cannot find') || errorMessage.includes('MODULE_NOT_FOUND')) {
        throw new Error(`
To use "${model}" tokenizer, install @chonkiejs/token:

  npm install @chonkiejs/token

Or use character-based tokenization (no dependencies):

  const tokenizer = await Tokenizer.create();
  const tokenizer = await Tokenizer.create('character');

Available with @chonkiejs/token: gpt2, bert-base-uncased, Xenova/gpt-4, etc.
        `.trim());
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Count the number of tokens in the given text.
   * For character-based tokenization, this is simply the length of the text.
   *
   * @param text - The text to count tokens for
   * @returns The number of tokens (characters) in the text
   */
  countTokens(text: string): number {
    return text.length;
  }

  /**
   * Encode text into token IDs.
   * For character-based tokenization, returns character codes.
   *
   * @param text - The text to encode
   * @returns Array of character codes
   */
  encode(text: string): number[] {
    return Array.from(text).map(char => char.codePointAt(0)!);
  }

  /**
   * Decode token IDs back into text.
   * For character-based tokenization, converts character codes back to string.
   *
   * @param tokens - Array of token IDs (character codes)
   * @returns The decoded text
   */
  decode(tokens: number[]): string {
    // Spreading every token into a single call exceeds the engine's argument
    // limit (RangeError: Maximum call stack size exceeded) for large inputs,
    // so decode in bounded slices.
    if (tokens.length <= DECODE_SLICE_SIZE) {
      return String.fromCodePoint(...tokens);
    }
    const parts: string[] = [];
    for (let i = 0; i < tokens.length; i += DECODE_SLICE_SIZE) {
      parts.push(String.fromCodePoint(...tokens.slice(i, i + DECODE_SLICE_SIZE)));
    }
    return parts.join('');
  }

  /**
   * Decode a batch of token arrays.
   *
   * @param tokensBatch - Array of token arrays
   * @returns Array of decoded texts
   */
  decodeBatch(tokensBatch: number[][]): string[] {
    return tokensBatch.map(tokens => this.decode(tokens));
  }
}
