import * as coreClient from "@azure/core-client";

export const SponsorkitDomainApiSponsorsBeneficiaryRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSponsorsBeneficiaryRequest",
    modelProperties: {
      beneficiaryId: {
        serializedName: "beneficiaryId",
        required: true,
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
        required: true,
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
        required: true,
        type: {
          name: "Uuid"
        }
      },
      reference: {
        serializedName: "reference",
        required: true,
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
        required: true,
        type: {
          name: "Uuid"
        }
      },
      reference: {
        serializedName: "reference",
        required: true,
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
        required: true,
        readOnly: true,
        type: {
          name: "Number"
        }
      },
      monthlyInHundreds: {
        serializedName: "monthlyInHundreds",
        required: true,
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
        required: true,
        readOnly: true,
        type: {
          name: "Number"
        }
      },
      startedAtUtc: {
        serializedName: "startedAtUtc",
        required: true,
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
        required: true,
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
        required: true,
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
        required: true,
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
        required: true,
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
        required: true,
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
        required: true,
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiSignupAsSponsorRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiSignupAsSponsorRequest",
    modelProperties: {
      stripePaymentMethodId: {
        serializedName: "stripePaymentMethodId",
        required: true,
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
        required: true,
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
        required: true,
        type: {
          name: "Uuid"
        }
      },
      reference: {
        serializedName: "reference",
        required: true,
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiBountiesResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBountiesResponse",
    modelProperties: {
      bounties: {
        serializedName: "bounties",
        required: true,
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className: "SponsorkitDomainApiBountiesBountyResponse"
            }
          }
        }
      }
    }
  }
};

export const SponsorkitDomainApiBountiesBountyResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBountiesBountyResponse",
    modelProperties: {
      amountInHundreds: {
        serializedName: "amountInHundreds",
        required: true,
        type: {
          name: "Number"
        }
      },
      gitHubIssueId: {
        serializedName: "gitHubIssueId",
        required: true,
        type: {
          name: "Number"
        }
      },
      bountyCount: {
        serializedName: "bountyCount",
        required: true,
        type: {
          name: "Number"
        }
      }
    }
  }
};

export const SponsorkitDomainApiBountiesGitHubIssueIdGetResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBountiesGitHubIssueIdGetResponse",
    modelProperties: {
      bounties: {
        serializedName: "bounties",
        required: true,
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className:
                "SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse"
            }
          }
        }
      }
    }
  }
};

export const SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse",
    modelProperties: {
      amountInHundreds: {
        serializedName: "amountInHundreds",
        required: true,
        type: {
          name: "Number"
        }
      },
      createdAtUtc: {
        serializedName: "createdAtUtc",
        required: true,
        type: {
          name: "DateTime"
        }
      },
      creatorUser: {
        serializedName: "creatorUser",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse"
        }
      },
      awardedUser: {
        serializedName: "awardedUser",
        type: {
          name: "Composite",
          className:
            "SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse"
        }
      }
    }
  }
};

export const SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse",
    modelProperties: {
      id: {
        serializedName: "id",
        required: true,
        type: {
          name: "Number"
        }
      },
      gitHubUsername: {
        serializedName: "gitHubUsername",
        required: true,
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiBountiesGitHubIssueIdPostRequest: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiBountiesGitHubIssueIdPostRequest",
    modelProperties: {
      gitHubIssueId: {
        serializedName: "gitHubIssueId",
        required: true,
        type: {
          name: "Number"
        }
      },
      amountInHundreds: {
        serializedName: "amountInHundreds",
        required: true,
        type: {
          name: "Number"
        }
      }
    }
  }
};

export const SponsorkitDomainApiAccountResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiAccountResponse",
    modelProperties: {
      beneficiary: {
        serializedName: "beneficiary",
        type: {
          name: "any"
        }
      },
      sponsor: {
        serializedName: "sponsor",
        type: {
          name: "any"
        }
      }
    }
  }
};

export const SponsorkitDomainApiAccountPaymentMethodIntentResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiAccountPaymentMethodIntentResponse",
    modelProperties: {
      setupIntentClientSecret: {
        serializedName: "setupIntentClientSecret",
        required: true,
        type: {
          name: "String"
        }
      }
    }
  }
};

export const SponsorkitDomainApiAccountPaymentMethodAvailabilityResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "SponsorkitDomainApiAccountPaymentMethodAvailabilityResponse",
    modelProperties: {
      availability: {
        serializedName: "availability",
        type: {
          name: "Enum",
          allowedValues: ["notAvailable", "available"]
        }
      }
    }
  }
};
