export {}
declare module 'atom' {
  interface CommandRegistryTargetMap {
    'atom-text-editor[data-grammar~="haskell"]': TextEditorElement
  }
  interface Config {
    get<T extends keyof ConfigValues>(
      keyPath: T,
      options?: {
        sources?: string[]
        excludeSources?: string[]
        scope?: string[] | ScopeDescriptor
      },
    ): ConfigValues[T]
  }
}

declare module 'atom/autocomplete-plus' {
  interface AutocompleteProvider {
    getSuggestionDetailsOnSelect?: (
      suggestion: TextSuggestion | SnippetSuggestion,
    ) =>
      | Promise<TextSuggestion | SnippetSuggestion | null>
      | TextSuggestion
      | SnippetSuggestion
      | null
  }
}
