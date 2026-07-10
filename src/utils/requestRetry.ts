type RequestError = Error & { status?: number };

/** Retries transient transport/server failures once, never authentication or client errors. */
export async function retryOnceOnTransientFailure<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const status = (error as RequestError)?.status;
    if (status !== undefined && status < 500) throw error;
    return request();
  }
}
