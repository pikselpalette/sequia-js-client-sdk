import Transport from './transport.js';
import Session from './session.js';
import Registry from './registry.js';
import {
  where, field, param, textSearch
} from './query.js';

/**
 * @typedef {Object} ClientOptions
 * Options for the Client.
 * @property {string} directory - The directory to pass through to {@link Session}.
 * @property {string} registryUri - The registryUri to pass through to {@link Registry}.
 * @property {string?} identityUri - Optional identityUri to pass through to {@link Session}.
 * @property {string?} token - Token to authenticate with.
 * @property {string?} tenant - Tenant to initialize with.
 * @property {boolean?} enableCache - Indicates whether to cache service descriptors in {@link Registry}.
 * @property {encodeUri?} encodeURI - Indicates whether to encode URIs before requesting in {@link Transport}.
 *                                    Will not re-encode existing sequences (e.g. `%20` will stay as `%20`, but `%2` will encode to `%202`)
 */

/**
 * Provides initial setup and subsequent access to the SDK
 *
 * @param {ClientOptions} options - Options for the Client.
 *
 * @property {Transport} transport - a stored transport instance used for fetching
 * @property {Session} session - a stored session to query the current users' authentication state with
 * @property {Registry} registry - a stored registry reference to query
 *
 * @requires {@link Transport}
 * @requires {@link Session}
 * @requires {@link Registry}
 *
 * @tutorial getting_started
 *
 * @example
 *
 * import Client from '@pikselpalette/sequoia-js-client-sdk/lib/client';
 * import { where, field } from '@pikselpalette/sequoia-js-client-sdk/lib/query';
 *
 * // Create a client:
 * const client = new Client({ directory: 'piksel',
 *                           registry: 'https://registry-sandbox.sequoia.piksel.com' });
 *
 * client.login('username', 'password').then(session => {
 *   // You can now query the session provided as the first argument (or
 *   // client.session); e.g. `session.isActive()`
 *
 *   // Get a service::
 *   client.service('metadata').then(service => {
 *     // Get a resourceful endpoint (this is synchronous as the service passed
 *     // all the necessary data):
 *     const contents = service.resourcefulEndpoint('contents');
 *
 *     contents.browse(where().fields('title', 'mediumSynopsis','duration', 'ref')
 *                     .include('assets').page(1).perPage(24).orderByUpdatedAt().desc().count())
 *             .then(json => {
 *               // Do something with the json returned
 *             });
 *   });
 * }).catch(error => {
 *   // Not logged in, inspect `error` to see why
 * });
 *
 * @example
 *
 * // Adding a tenant argument to the Client means you can skip setting the tenant later on.
 * const client = new Client({ directory: 'piksel',
 *                             registry: 'https://registry-sandbox.sequoia.piksel.com',
 *                             tenant: 'demo' });
 *
 * @example
 *
 * // Adding a token argument to the Client means you do not need to call generate()
 * // in a separate step.
 * const client = new Client({ directory: 'piksel',
 *                             registry: 'https://registry-sandbox.sequoia.piksel.com',
 *                             token: 'yourGeneratedToken' });
 */
class Client {
  constructor({
    directory,
    registryUri,
    identityUri,
    token,
    tenant,
    enableCache,
    encodeUri
  }) {
    this.transport = new Transport({}, encodeUri);
    this.registry = new Registry(this.transport, registryUri, enableCache);
    this.session = new Session(
      this.transport,
      directory,
      this.registry,
      identityUri
    );

    if (tenant) this.setTenancy(tenant);
    if (token) this.generate(token);
  }

  /**
   * Get a {@link ServiceDescriptor} from the {@link Registry}
   *
   * @deprecated Deprecated since 1.2.0. Use {@link Client#serviceDescriptors}
   *
   * @see {@link Registry#getService}
   *
   * @returns {Promise}
   */
  service(serviceName) {
    console.warn(`client.service() is deprecated as it is passing a serviceDescriptor and not a service.
                  Please use client.serviceDescriptors() instead`);
    return this.serviceDescriptors(serviceName).then(([result]) => result);
  }

  /**
   * Get a list of {@link ServiceDescriptor}s from the service endpoint
   *
   * @see {@link Registry#getServiceDescriptors}
   *
   * @param {...string} serviceNames - service names
   *
   * @returns {Promise}
   */
  serviceDescriptors(...serviceNames) {
    return this.registry.getServiceDescriptors(...serviceNames);
  }

  /**
   * Get a list of {@link ServiceDescriptor}s from the SDK cache, falling back to the service endpoint
   *
   * @see {@link Registry#getCachedServiceDescriptors}
   *
   * @param {...string} serviceNames - service names
   *
   * @returns {Promise}
   */
  cachedServiceDescriptors(...serviceNames) {
    return this.registry.getCachedServiceDescriptors(...serviceNames);
  }

  /**
   * Log an end user in with username and password credentials
   *
   * @param {string?} username - the end user's username
   * @param {string?} password - the end user's password
   * @param {AuthenticationOptions?} options
   *
   * @example
   * // Standard 'pauth' login
   * client.login('test_username', 'test_password').then((session) => {
   *   // Do something with the session
   * });
   *
   * // 'pauth' style login to a custom endpoint
   * client.login('test_username', 'test_password', {
   *   url: 'https://example.com/custom/pauth'
   * }).then((session) => {
   *   // Custom url should return a json response of { 'access_token': <token> }
   *   // Do something with the session
   * });
   * @example
   * // Standard 'oauth' login (password grant)
   * const secret = 'somebase64secret==';
   * client.login('test_username', 'test_password', {
   *   strategy: 'oauth',
   *   secret
   * }).then((session) => {
   *   // Do something with the session
   * });
   *
   * @example
   * // Client oauth (client credentials grant)
   * const secret = 'somebase64secret==';
   * client.login(null, null, {
   *   strategy: 'oauth',
   *   secret
   * }).then((session) => {
   *   // Do something with the session
   * });
   *
   * @example
   * // login will reject when not passing a secret
   * client.login('test_username', 'test_password', {
   *   strategy: 'oauth'
   * }).catch((err) => {
   *   // Inspect `err`
   * });
   *
   * @see {Session#authenticateWithCredentials}
   *
   * @returns {Promise} - First argument to the resolved Promise is the {@link Session} object that
   * has been updatedc
   */
  login(username, password, options = { strategy: 'pauth' }) {
    return this.session
      .authenticateWithCredentials(username, password, options)
      .then(session => this.registry.fetch(session.currentOwner()))
      .then(() => this.session);
  }

  /**
   * Generate a Session from an existing bearer token.
   *
   * It is also useful to use this if you acquire an access token via other means,
   * i.e. an existing oauth mechanism for Sequoia
   *
   * Call this method without a token parameter to instantiate the client for anonymous
   * usage. Note: currently the Sequoia registry does not provide anonymous access.
   * See the below example for how to handle this currently.
   *
   * @param {string?} token - an existing bearer token for an end user
   *
   * @example
   * client.generate('some token').then(doSomething);
   *
   * @example
   * // Anonymous usage:
   * client.generate().catch((err) => {
   *   if (err.response && err.response.status === 401) {
   *     client.registry.tenant = SQ_DIRECTORY;
   *
   *     client.registry.services.push({
   *       owner: 'root',
   *       name: 'identity',
   *       title: 'Identity Service',
   *       location: SQ_IDENTITY_URL
   *     });
   *
   *     client.registry.services.push({
   *       owner: 'root',
   *       name: 'gateway',
   *       title: 'Gateway Service',
   *       location: client.registry.registryUri.replace('registry', 'gateway')
   *     });
   *   }
   * }).then(doSomething);
   *
   * @returns {Promise} - First argument to the resolved Promise is the `Session` object that
   * has been updated
   */
  generate(token) {
    const p = this.session.authenticateWithToken(token);

    return p
      .then(session => this.registry.fetch(session.currentOwner()))
      .then(() => this.session);
  }

  /**
   * Log out an end user
   *
   * @returns {Session}
   */
  logout() {
    return this.session.destroy();
  }

  /**
   * Set the current tenancy for the user
   *
   * When switching tenancies, [this.registry]{@link Registry} will be
   * repopulated with the services available in that tenancy.
   *
   * Note: existing instances of {@link ServiceDescriptor}s, {@link ResourcefulEndpoint}s etc
   * will not have the 'owner' updated when switching to a new tenancy. See the below
   * example for more info.
   *
   * @param {string} tenantName - the name of the tenancy to use
   *
   * @example <caption>Switching a tenancy</caption>
   * await client.generate(some_token);
   * await client.setTenancy('test');
   *
   * let identity = await client.service('identity');
   * let usersEndpoint = identity.resourcefulEndpoint('users');
   * await usersEndpoint.browse() // https://<endpoint>/data/users?owner=test
   *
   * await client.setTenancy('production');
   * // At this point `identity` and `usersEndpoint` will still be doing
   * // `fetch`es with `?owner=test`. You will need to repopulate them
   * // as below
   * await usersEndpoint.browse() // https://<endpoint>/data/users?owner=test
   *
   * identity = await client.service('identity');
   * usersEndpoint = identity.resourcefulEndpoint('users');
   * await usersEndpoint.browse() // https://<endpoint>/data/users?owner=production
   *
   * @returns {Promise<Session>}
   */
  setTenancy(tenantName) {
    // If the tenants.length === 0, it indicated that we are logging in
    // as an anonymous user, where the tenants would not have been set.
    if (this.session.tenants.length > 0) {
      const tenantIds = this.session.tenants.map(item => item.name);

      if (!tenantIds.some(n => n === tenantName)) {
        return Promise.reject(new Error('Tenant does not exist'));
      }
    }

    this.session.currentTenant = tenantName;

    // Switching a tenancy whilst we've already logged in requires us
    // to update the registry
    return this.registry
      .fetch(tenantName)
      .then(() => this.session.populateAccess())
      .then(() => this.session);
  }

  /**
   * Set the current directory
   *
   * This will only affect new authentications,
   * if the client is already authenticated, it will not do anything.
   *
   */
  setDirectory(directory) {
    this.session.directory = directory;
  }

  /**
   * Set callback for when the Token is about to expire,
   * will be called before expiry based on the provided threshold
   *
   * Call with null to cancel the callback.
   *
   * @param  {Function} callback Will be called with the current [session.access]{@link Session}
   * @param  {Number} threshold Number of milliseconds _before_ expiry when callback will be invoked. Defaults to 60000 (1 minute)
   */
  onExpiryWarning(callback, threshold = 60000) {
    this.session.setOnExpiryWarning(callback, threshold);
  }
}

// Export the query methods for use in non-es6 module environments.
// e.g.
// const Client = require('@pikselpalette/sequoia-js-client-sdk/dist/sequoia-client.js');
// const { where, field, param, textSearch } = Client;

Client.where = where;
Client.field = field;
Client.param = param;
Client.textSearch = textSearch;

export default Client;
