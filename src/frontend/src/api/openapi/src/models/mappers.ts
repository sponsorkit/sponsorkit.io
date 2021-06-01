import * as coreClient from "@azure/core-client";

export const SponsorkitDomainApiSponsorsBeneficiaryRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSponsorsBeneficiaryRequest",
    modelProperties: {
      beneficiaryId: {
        serializedName: "beneficiaryId",
        type: {
          name: "Uuid"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSponsorsBeneficiaryResponse",
    modelProperties: {
      id: {
        serializedName: "id",
        type: {
          name: "Uuid"
        }
      },
      gitHubId: {
        serializedName: "gitHubId",
        nullable: true,
        type: {
          name: "Number"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest",
    modelProperties: {
      beneficiaryId: {
        serializedName: "beneficiaryId",
        type: {
          name: "Uuid"
        }
      },
      reference: {
        serializedName: "reference",
        type: {
          name: "String"
        }
      },
      amountInHundreds: {
        serializedName: "amountInHundreds",
        nullable: true,
        type: {
          name: "Number"
        }
      },
      email: {
        serializedName: "email",
        nullable: true,
        type: {
          name: "String"
        }
      },
      stripeCardId: {
        serializedName: "stripeCardId",
        nullable: true,
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest",
    modelProperties: {
      beneficiaryId: {
        serializedName: "beneficiaryId",
        type: {
          name: "Uuid"
        }
      },
      reference: {
        serializedName: "reference",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse",
    modelProperties: {
      donations: {
        serializedName: "donations",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse"
        }
      },
      sponsors: {
        serializedName: "sponsors",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className:
      "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse",
    modelProperties: {
      totalInHundreds: {
        serializedName: "totalInHundreds",
        readOnly: true,
        type: {
          name: "Number"
        }
      },
      monthlyInHundreds: {
        serializedName: "monthlyInHundreds",
        readOnly: true,
        type: {
          name: "Number"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className:
      "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse",
    modelProperties: {
      current: {
        serializedName: "current",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
        }
      },
      byAmount: {
        serializedName: "byAmount",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse"
        }
      },
      byDate: {
        serializedName: "byDate",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className:
      "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse",
    modelProperties: {
      monthlyAmountInHundreds: {
        serializedName: "monthlyAmountInHundreds",
        readOnly: true,
        nullable: true,
        type: {
          name: "Number"
        }
      },
      totalAmountInHundreds: {
        serializedName: "totalAmountInHundreds",
        readOnly: true,
        type: {
          name: "Number"
        }
      },
      startedAtUtc: {
        serializedName: "startedAtUtc",
        readOnly: true,
        type: {
          name: "DateTime"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className:
      "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse",
    modelProperties: {
      most: {
        serializedName: "most",
        readOnly: true,
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className:
                "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
            }
          }
        }
      },
      least: {
        serializedName: "least",
        readOnly: true,
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className:
                "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
            }
          }
        }
      }
    }
  }
};

export const SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className:
      "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse",
    modelProperties: {
      latest: {
        serializedName: "latest",
        readOnly: true,
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className:
                "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
            }
          }
        }
      },
      oldest: {
        serializedName: "oldest",
        readOnly: true,
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className:
                "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
            }
          }
        }
      }
    }
  }
};

export const SponsorkitDomainApiSignupFromGitHubRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSignupFromGitHubRequest",
    modelProperties: {
      gitHubAuthenticationCode: {
        serializedName: "gitHubAuthenticationCode",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSignupFromGitHubResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSignupFromGitHubResponse",
    modelProperties: {
      token: {
        serializedName: "token",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest",
    modelProperties: {
      userId: {
        serializedName: "userId",
        type: {
          name: "Uuid"
        }
      }
    }
  }
};

export const SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest",
    modelProperties: {
      beneficiaryId: {
        serializedName: "beneficiaryId",
        type: {
          name: "Uuid"
        }
      },
      reference: {
        serializedName: "reference",
        type: {
          name: "String"
        }
      }
    }
  }
};