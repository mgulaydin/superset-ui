import fetchMock from 'fetch-mock';
import { SupersetClientClass, ClientConfig } from '../src';
import throwIfCalled from './utils/throwIfCalled';
import { LOGIN_GLOB } from './fixtures/constants';

describe('SupersetClientClass', () => {
  beforeAll(() => {
    fetchMock.get(LOGIN_GLOB, { csrf_token: '' });
  });

  afterAll(fetchMock.restore);

  it('new SupersetClientClass()', () => {
    const client = new SupersetClientClass();
    expect(client).toBeInstanceOf(SupersetClientClass);
  });

  describe('.getUrl()', () => {
    let client = new SupersetClientClass();

    beforeEach(() => {
      client = new SupersetClientClass({ protocol: 'https:', host: 'CONFIG_HOST' });
    });

    it('uses url if passed', () => {
      expect(client.getUrl({ url: 'myUrl', endpoint: 'blah', host: 'blah' })).toBe('myUrl');
    });

    it('constructs a valid url from config.protocol + host + endpoint if passed', () => {
      expect(client.getUrl({ endpoint: '/test', host: 'myhost' })).toBe('https://myhost/test');
      expect(client.getUrl({ endpoint: '/test', host: 'myhost/' })).toBe('https://myhost/test');
      expect(client.getUrl({ endpoint: 'test', host: 'myhost' })).toBe('https://myhost/test');
      expect(client.getUrl({ endpoint: '/test/test//', host: 'myhost/' })).toBe(
        'https://myhost/test/test//',
      );
    });

    it('constructs a valid url from config.host + endpoint if host is omitted', () => {
      expect(client.getUrl({ endpoint: '/test' })).toBe('https://CONFIG_HOST/test');
    });

    it('does not throw if url, endpoint, and host are', () => {
      client = new SupersetClientClass({ protocol: 'https:', host: '' });
      expect(client.getUrl()).toBe('https:///');
    });
  });

  describe('.init()', () => {
    afterEach(() => {
      fetchMock.reset();
      // reset
      fetchMock.get(LOGIN_GLOB, { csrf_token: 1234 }, { overwriteRoutes: true });
    });

    it('calls superset/csrf_token/ when init() is called if no CSRF token is passed', () => {
      expect.assertions(1);

      return new SupersetClientClass().init().then(() => {
        expect(fetchMock.calls(LOGIN_GLOB)).toHaveLength(1);

        return true;
      });
    });

    it('does NOT call superset/csrf_token/ when init() is called if a CSRF token is passed', () => {
      expect.assertions(1);

      return new SupersetClientClass({ csrfToken: 'abc' }).init().then(() => {
        expect(fetchMock.calls(LOGIN_GLOB)).toHaveLength(0);

        return true;
      });
    });

    it('calls superset/csrf_token/ when init(force=true) is called even if a CSRF token is passed', () => {
      expect.assertions(4);
      const initialToken = 'initial_token';
      const client = new SupersetClientClass({ csrfToken: initialToken });

      return client.init().then(() => {
        expect(fetchMock.calls(LOGIN_GLOB)).toHaveLength(0);
        expect(client.csrfToken).toBe(initialToken);

        return client.init(true).then(() => {
          expect(fetchMock.calls(LOGIN_GLOB)).toHaveLength(1);
          expect(client.csrfToken).not.toBe(initialToken);

          return true;
        });
      });
    });

    it('throws if superset/csrf_token/ returns an error', () => {
      expect.assertions(1);

      fetchMock.get(LOGIN_GLOB, () => Promise.reject({ status: 403 }), {
        overwriteRoutes: true,
      });

      return new SupersetClientClass({})
        .init()
        .then(throwIfCalled)
        .catch(error => {
          expect(error.status).toBe(403);

          return true;
        });
    });

    it('throws if superset/csrf_token/ does not return a token', () => {
      expect.assertions(1);
      fetchMock.get(LOGIN_GLOB, {}, { overwriteRoutes: true });

      return new SupersetClientClass({})
        .init()
        .then(throwIfCalled)
        .catch(error => {
          expect(error).toBeDefined();

          return true;
        });
    });

    it('does not set csrfToken if response is not json', () => {
      fetchMock.get(LOGIN_GLOB, '123', {
        overwriteRoutes: true,
      });

      return new SupersetClientClass({})
        .init()
        .then(throwIfCalled)
        .catch(error => {
          expect(error).toBeDefined();

          return true;
        });
    });
  });

  describe('.isAuthenticated()', () => {
    afterEach(fetchMock.reset);

    it('returns true if there is a token and false if not', () => {
      expect.assertions(2);
      const client = new SupersetClientClass({});
      expect(client.isAuthenticated()).toBe(false);

      return client.init().then(() => {
        expect(client.isAuthenticated()).toBe(true);

        return true;
      });
    });

    it('returns true if a token is passed at configuration', () => {
      expect.assertions(2);
      const clientWithoutToken = new SupersetClientClass({ csrfToken: undefined });
      const clientWithToken = new SupersetClientClass({ csrfToken: 'token' });

      expect(clientWithoutToken.isAuthenticated()).toBe(false);
      expect(clientWithToken.isAuthenticated()).toBe(true);
    });
  });

  describe('.ensureAuth()', () => {
    it(`returns a promise that rejects if .init() has not been called`, () => {
      expect.assertions(2);

      const client = new SupersetClientClass({});

      return client
        .ensureAuth()
        .then(throwIfCalled)
        .catch(error => {
          expect(error).toEqual(expect.objectContaining({ error: expect.any(String) }));
          expect(client.isAuthenticated()).toBe(false);

          return true;
        });
    });

    it('returns a promise that resolves if .init() resolves successfully', () => {
      expect.assertions(1);

      const client = new SupersetClientClass({});

      return client.init().then(() =>
        client
          .ensureAuth()
          .then(throwIfCalled)
          .catch(() => {
            expect(client.isAuthenticated()).toBe(true);

            return true;
          }),
      );
    });

    it(`returns a promise that rejects if .init() is unsuccessful`, () => {
      const rejectValue = { status: 403 };
      fetchMock.get(LOGIN_GLOB, () => Promise.reject(rejectValue), {
        overwriteRoutes: true,
      });

      expect.assertions(3);

      const client = new SupersetClientClass({});

      return client
        .init()
        .then(throwIfCalled)
        .catch(error => {
          expect(error).toEqual(expect.objectContaining(rejectValue));

          return client
            .ensureAuth()
            .then(throwIfCalled)
            .catch(error2 => {
              expect(error2).toEqual(expect.objectContaining(rejectValue));
              expect(client.isAuthenticated()).toBe(false);

              // reset
              fetchMock.get(
                LOGIN_GLOB,
                { csrf_token: 1234 },
                {
                  overwriteRoutes: true,
                },
              );

              return true;
            });
        });
    });
  });

  describe('requests', () => {
    afterEach(fetchMock.reset);
    const protocol = 'https:';
    const host = 'HOST';
    const mockGetEndpoint = '/get/url';
    const mockRequestEndpoint = '/request/url';
    const mockPostEndpoint = '/post/url';
    const mockPutEndpoint = '/put/url';
    const mockDeleteEndpoint = '/delete/url';
    const mockTextEndpoint = '/text/endpoint';
    const mockGetUrl = `${protocol}//${host}${mockGetEndpoint}`;
    const mockRequestUrl = `${protocol}//${host}${mockRequestEndpoint}`;
    const mockPostUrl = `${protocol}//${host}${mockPostEndpoint}`;
    const mockTextUrl = `${protocol}//${host}${mockTextEndpoint}`;
    const mockPutUrl = `${protocol}//${host}${mockPutEndpoint}`;
    const mockDeleteUrl = `${protocol}//${host}${mockDeleteEndpoint}`;
    const mockTextJsonResponse = '{ "value": 9223372036854775807 }';
    const mockPayload = { json: () => Promise.resolve('payload') };

    fetchMock.get(mockGetUrl, mockPayload);
    fetchMock.post(mockPostUrl, mockPayload);
    fetchMock.put(mockPutUrl, mockPayload);
    fetchMock.delete(mockDeleteUrl, mockPayload);
    fetchMock.delete(mockRequestUrl, mockPayload);
    fetchMock.get(mockTextUrl, mockTextJsonResponse);
    fetchMock.post(mockTextUrl, mockTextJsonResponse);

    it('checks for authentication before every get and post request', () => {
      expect.assertions(6);
      const authSpy = jest.spyOn(SupersetClientClass.prototype, 'ensureAuth');
      const client = new SupersetClientClass({ protocol, host });

      return client.init().then(() =>
        Promise.all([
          client.get({ url: mockGetUrl }),
          client.post({ url: mockPostUrl }),
          client.put({ url: mockPutUrl }),
          client.delete({ url: mockDeleteUrl }),
          client.request({ url: mockRequestUrl, method: 'DELETE' }),
        ]).then(() => {
          expect(fetchMock.calls(mockGetUrl)).toHaveLength(1);
          expect(fetchMock.calls(mockPostUrl)).toHaveLength(1);
          expect(fetchMock.calls(mockDeleteUrl)).toHaveLength(1);
          expect(fetchMock.calls(mockPutUrl)).toHaveLength(1);
          expect(fetchMock.calls(mockRequestUrl)).toHaveLength(1);
          expect(authSpy).toHaveBeenCalledTimes(5);
          authSpy.mockRestore();

          return true;
        }),
      );
    });

    it('sets protocol, host, headers, mode, and credentials from config', () => {
      expect.assertions(3);
      const clientConfig: ClientConfig = {
        host,
        protocol,
        mode: 'cors',
        credentials: 'include',
        headers: { my: 'header' },
      };

      const client = new SupersetClientClass(clientConfig);

      return client.init().then(() =>
        client.get({ url: mockGetUrl }).then(() => {
          const fetchRequest = fetchMock.calls(mockGetUrl)[0][1];
          expect(fetchRequest.mode).toBe(clientConfig.mode);
          expect(fetchRequest.credentials).toBe(clientConfig.credentials);
          expect(fetchRequest.headers).toEqual(
            expect.objectContaining(clientConfig.headers as Object),
          );

          return true;
        }),
      );
    });

    describe('.get()', () => {
      it('makes a request using url or endpoint', () => {
        expect.assertions(1);
        const client = new SupersetClientClass({ protocol, host });

        return client.init().then(() =>
          Promise.all([
            client.get({ url: mockGetUrl }),
            client.get({ endpoint: mockGetEndpoint }),
          ]).then(() => {
            expect(fetchMock.calls(mockGetUrl)).toHaveLength(2);

            return true;
          }),
        );
      });

      it('supports parsing a response as text', () => {
        expect.assertions(2);
        const client = new SupersetClientClass({ protocol, host });

        return client
          .init()
          .then(() =>
            client
              .get({ url: mockTextUrl, parseMethod: 'text' })
              .then(({ text }) => {
                expect(fetchMock.calls(mockTextUrl)).toHaveLength(1);
                expect(text).toBe(mockTextJsonResponse);

                return true;
              })
              .catch(throwIfCalled),
          )
          .catch(throwIfCalled);
      });

      it('allows overriding host, headers, mode, and credentials per-request', () => {
        expect.assertions(3);
        const clientConfig: ClientConfig = {
          host,
          protocol,
          mode: 'cors',
          credentials: 'include',
          headers: { my: 'header' },
        };

        const overrideConfig: ClientConfig = {
          host: 'override_host',
          mode: 'no-cors',
          credentials: 'omit',
          headers: { my: 'override', another: 'header' },
        };

        const client = new SupersetClientClass(clientConfig);

        return client
          .init()
          .then(() =>
            client
              .get({ url: mockGetUrl, ...overrideConfig })
              .then(() => {
                const fetchRequest = fetchMock.calls(mockGetUrl)[0][1];
                expect(fetchRequest.mode).toBe(overrideConfig.mode);
                expect(fetchRequest.credentials).toBe(overrideConfig.credentials);
                expect(fetchRequest.headers).toEqual(
                  expect.objectContaining(overrideConfig.headers as Object),
                );

                return true;
              })
              .catch(throwIfCalled),
          )
          .catch(throwIfCalled);
      });
    });

    describe('.post()', () => {
      it('makes a request using url or endpoint', () => {
        expect.assertions(1);
        const client = new SupersetClientClass({ protocol, host });

        return client.init().then(() =>
          Promise.all([
            client.post({ url: mockPostUrl }),
            client.post({ endpoint: mockPostEndpoint }),
          ]).then(() => {
            expect(fetchMock.calls(mockPostUrl)).toHaveLength(2);

            return true;
          }),
        );
      });

      it('allows overriding host, headers, mode, and credentials per-request', () => {
        const clientConfig: ClientConfig = {
          host,
          protocol,
          mode: 'cors',
          credentials: 'include',
          headers: { my: 'header' },
        };

        const overrideConfig: ClientConfig = {
          host: 'override_host',
          mode: 'no-cors',
          credentials: 'omit',
          headers: { my: 'override', another: 'header' },
        };

        const client = new SupersetClientClass(clientConfig);

        return client.init().then(() =>
          client.post({ url: mockPostUrl, ...overrideConfig }).then(() => {
            const fetchRequest = fetchMock.calls(mockPostUrl)[0][1];
            expect(fetchRequest.mode).toBe(overrideConfig.mode);
            expect(fetchRequest.credentials).toBe(overrideConfig.credentials);
            expect(fetchRequest.headers).toEqual(
              expect.objectContaining(overrideConfig.headers as Object),
            );

            return true;
          }),
        );
      });

      it('supports parsing a response as text', () => {
        expect.assertions(2);
        const client = new SupersetClientClass({ protocol, host });

        return client.init().then(() =>
          client.post({ url: mockTextUrl, parseMethod: 'text' }).then(({ text }) => {
            expect(fetchMock.calls(mockTextUrl)).toHaveLength(1);
            expect(text).toBe(mockTextJsonResponse);

            return true;
          }),
        );
      });

      it('passes postPayload key,values in the body', () => {
        expect.assertions(3);

        const postPayload = { number: 123, array: [1, 2, 3] } as any;
        const client = new SupersetClientClass({ protocol, host });

        return client.init().then(() =>
          client.post({ url: mockPostUrl, postPayload }).then(() => {
            const formData = fetchMock.calls(mockPostUrl)[0][1].body as FormData;
            expect(fetchMock.calls(mockPostUrl)).toHaveLength(1);
            Object.keys(postPayload).forEach(key => {
              expect(formData.get(key)).toBe(JSON.stringify(postPayload[key]));
            });

            return true;
          }),
        );
      });

      it('respects the stringify parameter for postPayload key,values', () => {
        expect.assertions(3);
        const postPayload = { number: 123, array: [1, 2, 3] } as any;
        const client = new SupersetClientClass({ protocol, host });

        return client.init().then(() =>
          client.post({ url: mockPostUrl, postPayload, stringify: false }).then(() => {
            const formData = fetchMock.calls(mockPostUrl)[0][1].body as FormData;
            expect(fetchMock.calls(mockPostUrl)).toHaveLength(1);
            Object.keys(postPayload).forEach(key => {
              expect(formData.get(key)).toBe(String(postPayload[key]));
            });

            return true;
          }),
        );
      });
    });
  });
});
