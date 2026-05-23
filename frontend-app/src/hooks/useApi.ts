import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../services/api'

export function useFetch<T>(url: string, key: string) {
  return useQuery<T>({
    queryKey: [key],
    queryFn: () => fetchApi<T>(url),
  })
}
