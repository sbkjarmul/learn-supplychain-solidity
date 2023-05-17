const { expectEvent, BN } = require("@openzeppelin/test-helpers");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");

const ColdChain = artifacts.require("ColdChain");

contract("ColdChain", (accounts) => {
  beforeEach(async () => {
    this.VACCINE_BRANDS = {
      Pfizer: "Prizer-BioNTech",
      Moderna: "Moderna",
      Janssen: "Johnson & Johnson's Janssen",
      Sputnik: "Sputnik V",
    };

    this.ModeEnums = {
      ISSUER: { val: "ISSUER", pos: 0 },
      PROVER: { val: "PROVER", pos: 1 },
      VERIFIER: { val: "VERIFIER", pos: 2 },
    };

    this.StatusEnums = {
      MANUFACTURED: { val: "MANUFACTURED", pos: 0 },
      DELIVERING_INTERNATIONAL: { val: "DELIVERING_INTERNATIONAL", pos: 1 },
      STORED: { val: "STORED", pos: 2 },
      DELIVERING_LOCAL: { val: "DELIVERING_LOCAL", pos: 3 },
      DELIVERED: { val: "DELIVERED", pos: 4 },
    };

    this.defaultEntities = {
      manufacturerA: { id: accounts[1], mode: this.ModeEnums.PROVER.val },
      manufacturerB: { id: accounts[2], mode: this.ModeEnums.PROVER.val },
      inspector: { id: accounts[3], mode: this.ModeEnums.ISSUER.val },
      distributorGlobal: { id: accounts[4], mode: this.ModeEnums.VERIFIER.val },
      distributorLocal: { id: accounts[5], mode: this.ModeEnums.VERIFIER.val },
      immunizer: { id: accounts[6], mode: this.ModeEnums.ISSUER.val },
      traveler: { id: accounts[7], mode: this.ModeEnums.PROVER.val },
      borderAgent: { id: accounts[8], mode: this.ModeEnums.VERIFIER.val },
    };

    this.defaultVaccineBatches = {
      0: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      1: {
        brand: this.VACCINE_BRANDS.Moderna,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      2: {
        brand: this.VACCINE_BRANDS.Janssen,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      3: {
        brand: this.VACCINE_BRANDS.Sputnik,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      4: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      5: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      6: {
        brand: this.VACCINE_BRANDS.Moderna,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      7: {
        brand: this.VACCINE_BRANDS.Moderna,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      8: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      9: {
        brand: this.VACCINE_BRANDS.Sputnik,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      10: {
        brand: this.VACCINE_BRANDS.Janssen,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
    };

    this.coldChainInstance = await ColdChain.deployed();
    this.owner = accounts[0];
    this.providerOrUrl = "http://localhost:8545";

    this.provider = new HDWalletProvider({
      mnemonic:
        "kitchen anger gallery reject plastic famous camp tooth spin beef usage fence",
      provider: "http://localhost:8545",
    });
  });

  it("should add entities successfully", async () => {
    for (const entity in this.defaultEntities) {
      const { id, mode } = this.defaultEntities[entity];

      const result = await this.coldChainInstance.addEntity(id, mode, {
        from: this.owner,
      });

      expectEvent(result.receipt, "AddEntityEvent", {
        entityId: id,
        entityMode: mode,
      });

      const retrievedEntity = await this.coldChainInstance.entities.call(id);
      assert.equal(retrievedEntity.id, id, "Mismatched ids");
      assert.equal(
        retrievedEntity.mode.toString(),
        this.ModeEnums[mode].pos,
        "Mismatched modes"
      );
    }
  });

  it("should add vaccine batches successfully", async () => {
    for (let i = 0; i < Object.keys(this.defaultVaccineBatches).length; i++) {
      const { brand, manufacturer } = this.defaultVaccineBatches[i];

      const result = await this.coldChainInstance.addVaccineBatch(
        brand,
        manufacturer,
        { from: this.owner }
      );

      expectEvent(result.receipt, "AddVaccineBatchEvent", {
        vaccineBatchId: String(i),
        manufacturer: manufacturer,
      });

      const retrievedVaccineBatch =
        await this.coldChainInstance.vaccineBatches.call(i);
      assert.equal(retrievedVaccineBatch.id, i);
      assert.equal(retrievedVaccineBatch.brand, brand);
      assert.equal(retrievedVaccineBatch.manufacturer, manufacturer);
      assert.equal(retrievedVaccineBatch.certificateIds, undefined);
    }
  });

  it("should sign a message and store as a certificate from the issuer to the prover", async () => {
    this.web3 = new Web3(this.provider);

    const { inspector, manufacturerA } = this.defaultEntities;
    const vaccineBatchId = 0;
    const message = `Inspector (${inspector.id}) has certified vaccine batch #${vaccineBatchId} for Manufacturer (${manufacturerA.id}).`;
    const signature = await this.web3.eth.sign(
      this.web3.utils.keccak256(message),
      inspector.id
    );

    const result = await this.coldChainInstance.issueCertificate(
      inspector.id,
      manufacturerA.id,
      this.StatusEnums.MANUFACTURED.val,
      vaccineBatchId,
      signature,
      { from: this.owner }
    );

    expectEvent(result.receipt, "IssueCertificateEvent", {
      issuer: inspector.id,
      prover: manufacturerA.id,
      certificateId: new BN(0),
    });

    const retrievedCertificate = await this.coldChainInstance.certificates.call(
      0
    );
    assert.equal(retrievedCertificate.id, 0);
    assert.equal(retrievedCertificate.issuer["id"], inspector.id);
    assert.equal(retrievedCertificate.prover["id"], manufacturerA.id);
    assert.equal(retrievedCertificate.signature, signature);
    assert.equal(
      retrievedCertificate.status,
      this.StatusEnums.MANUFACTURED.pos.toString()
    );
  });

  it("should verify that the certificate signature matches the issuer", async () => {
    this.web3 = new Web3(this.provider);

    const { inspector, manufacturerA } = this.defaultEntities;
    const vaccineBatchId = 0;
    const message = `Inspector (${inspector.id}) has certified vaccine batch #${vaccineBatchId} for Manufacturer (${manufacturerA.id}).`;

    const certificate = await this.coldChainInstance.certificates.call(0);

    const signatureMatches = await this.coldChainInstance.isMatchingSignature(
      this.web3.utils.keccak256(message),
      certificate.id,
      inspector.id,
      { from: this.owner }
    );

    assert.equal(signatureMatches, true);
  });
});
