import { useCallback, useEffect, useState } from 'react';
import { EMPTY_TAXONOMY, type TaxonomySnapshot } from '@otp/domain';
import { fetchTaxonomy } from '../api/taxonomy';

/**
 * Loads the category tree once for the whole wizard. Every step reads from this
 * snapshot, so the form and the parser can never disagree about what exists.
 */
export function useTaxonomy() {
  const [taxonomy, setTaxonomy] = useState<TaxonomySnapshot>(EMPTY_TAXONOMY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await fetchTaxonomy();
    if (result.ok) {
      setTaxonomy(result.taxonomy);
      setError(null);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { taxonomy, isLoading, error, refresh: load };
}
