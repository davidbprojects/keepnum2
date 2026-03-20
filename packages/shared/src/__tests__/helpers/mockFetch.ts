export function mockFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as Response['type'],
    url: '',
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: jest.fn().mockResolvedValue(new Blob([])),
    formData: jest.fn().mockResolvedValue(new FormData()),
  };
}

export function mockFetchSequence(
  responses: Array<{ status: number; body: unknown }>
): void {
  const fetchMock = jest.fn() as jest.Mock;

  responses.forEach((resp) => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(resp.status, resp.body));
  });

  global.fetch = fetchMock;
}
