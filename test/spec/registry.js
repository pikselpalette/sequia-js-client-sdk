import fetchMock from 'fetch-mock';
import Registry, { Service } from '../../lib/registry.js';
import BusinessEndpoint from '../../lib/business_endpoint.js';
import ResourcefulEndpoint from '../../lib/resourceful_endpoint.js';
import Transport from '../../lib/transport.js';
import servicesFixture from '../fixtures/services.json';
import metadataDescriptorFixture from '../fixtures/metadata-descriptor.json';
import gatewayDescriptorFixture from '../fixtures/gateway-descriptor.json';

describe('Registry', () => {
  let registry;
  let transport;
  const registryUri = 'http://localhost/registry';
  const testTenant = 'testTenant';
  const servicesUri = `${registryUri}/services/${testTenant}`;
  const descriptorUri = `https://metadata-euw1shared.sequoia.piksel.com/descriptor/raw?owner=${testTenant}`;
  const gatewayDescriptorUri = `https://gateway-euw1shared.sequoia.piksel.com/descriptor/raw?owner=${testTenant}`;

  beforeEach(() => {
    transport = new Transport();
    fetchMock.mock(servicesUri, servicesFixture)
      .mock(descriptorUri, metadataDescriptorFixture)
      .mock(gatewayDescriptorUri, gatewayDescriptorFixture);
    registry = new Registry(transport, registryUri);
  });

  afterEach(fetchMock.restore);

  describe('constructor', () => {
    it('should initialise its registryUri property to be the argument passed in', () => {
      expect(registry.registryUri).toEqual(registryUri);
    });

    it('should initialise its services property as an empty array', () => {
      expect(registry.services).toEqual(expect.any(Array));
      expect(registry.services.length).toBe(0);
    });
  });

  describe('fetch', () => {
    beforeEach(async () => registry.fetch(testTenant));

    it('should set the tenant property to be the argument passed in', () => {
      expect(registry.tenant).toEqual(testTenant);
    });

    it('should call the services/<tenant> endpoint of the Sequoia registry', () => {
      expect(fetchMock.lastUrl()).toEqual(servicesUri);
    });

    it('should set the services property to the data returned from Sequoia', () => {
      expect(registry.services.length).toBeGreaterThan(0);
      expect(registry.services).toEqual(servicesFixture.services);
    });

    it('should resolve with the data returned from Sequoia', async () => {
      await expect(registry.fetch(testTenant)).resolves.toEqual(expect.objectContaining(servicesFixture));
    });
  });

  describe('getService', () => {
    beforeEach(async () => registry.fetch(testTenant));

    it('should reject when it can\'t find a service with the supplied name', async () =>
      expect(registry.getService('thisdoesnotexist')).rejects.toThrow());

    it('should perform a GET on the services descriptor/raw endpoint', async () => {
      await registry.getService('metadata');
      expect(fetchMock.lastUrl()).toEqual(descriptorUri);
      expect(fetchMock.lastOptions()).toEqual(expect.objectContaining({ method: 'GET' }));
    });

    it('should resolve with a Service instance populated with the data from the descriptor endpoint', async () => {
      await expect(registry.getService('metadata')).resolves.toEqual({
        asymmetricMatch: actual => actual instanceof Service && actual.data.name === 'metadata'
      });
    });

    it('should resolve with a Service instance with the location set to the services location', async () => {
      await expect(registry.getService('metadata')).resolves.toEqual({
        asymmetricMatch: actual => actual.data.location === 'https://metadata-euw1shared.sequoia.piksel.com'
      });
    });

    it('should resolve with a Service instance with the owner set to the services owner', async () => {
      await expect(registry.getService('metadata')).resolves.toEqual({
        asymmetricMatch: actual => actual.data.owner === 'root'
      });
    });

    it('should resolve with a Service instance with the tenant set to the registry\'s tenant', async () => {
      await expect(registry.getService('metadata')).resolves.toEqual({
        asymmetricMatch: actual => actual.data.tenant === testTenant
      });
    });
  });

  describe('getServices', () => {
    beforeEach(async () => {
      jest.spyOn(registry, 'getService').mockImplementation(service => Promise.resolve(service));
      return registry.fetch(testTenant);
    });

    it('should return a Service for each service specified', (done) => {
      const requestedServices = ['metadata', 'contents'];
      registry.getServices(...requestedServices).then((services) => {
        expect(services).toEqual(requestedServices);
        done();
      });
    });

    it('should return all Services when no services are specified', (done) => {
      const allServices = registry.services.map(s => s.name);
      registry.getServices().then((services) => {
        expect(services).toEqual(allServices);
        done();
      });
    });
  });

  describe('Service', () => {
    let service;

    beforeEach(async () => {
      await registry.fetch(testTenant);
      service = await registry.getService('metadata');
    });

    describe('constructor', () => {
      it('should set its data property', () => {
        const testData = { test: 'data' };

        expect(service.data).toBeDefined();
        expect((new Service(transport)).data).not.toBeDefined();
        expect((new Service(transport, testData)).data).toEqual(expect.objectContaining(testData));
      });
    });

    describe('businessEndpoint', () => {
      let gatewayService;

      beforeEach(done => registry.getService('gateway').then((fetchedService) => { gatewayService = fetchedService; }).then(done));

      it('should return null when no route has a name that matches', () => {
        expect(gatewayService.businessEndpoint('thisdoesnotexist')).toBeNull();
      });

      it('should return a BusinessEndpoint when there is a route that matches the supplied name', () => {
        const endpoint = gatewayService.businessEndpoint('feeds', { name: 'test' });
        expect(endpoint).not.toBeNull();
        expect(endpoint).toEqual(expect.any(BusinessEndpoint));
      });
    });

    describe('resourcefulEndpoint', () => {
      it('should return null when no resourceful has a name that matches', () => {
        expect(service.resourcefulEndpoint('thisdoesnotexist')).toBeNull();
      });

      it('should return a ResourcefulEndpoint when there is a resourceful that matches the supplied name', () => {
        const endpoint = service.resourcefulEndpoint('contents');
        expect(endpoint).not.toBeNull();
        expect(endpoint).toEqual(expect.any(ResourcefulEndpoint));
      });
    });

    describe('resourcefulEndpoints', () => {
      it('should return an array of the ResourcefulEndpoints specified', () => {
        const [contents, thisdoesnotexist] = service.resourcefulEndpoints('contents', 'thisdoesnotexist');

        expect(contents).not.toBeNull();
        expect(contents).toEqual(expect.any(ResourcefulEndpoint));
        expect(thisdoesnotexist).toBeNull();
      });

      it('should return an array of all the ResourcefulEndpoints when none are specified', () => {
        const endpoints = service.resourcefulEndpoints();
        const [assets] = endpoints;

        expect(assets).not.toBeNull();
        expect(assets).toEqual(expect.any(ResourcefulEndpoint));
        expect(endpoints.length).toEqual(15); // Number of resourcefuls in the metadata fixture
      });
    });

    describe('resourcefuls', () => {
      it('should return an object of resourcefuls', () => {
        expect(service.resourcefuls()).toEqual(expect.any(Object));
      });
    });
  });
});
