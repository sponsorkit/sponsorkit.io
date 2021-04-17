﻿using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Repository
    {
        [Key]
        public Guid Id { get; set; }

        public string GitHubId { get; set; } = null!;
        
        public DateTime CreatedAtUtc { get; set; }
        
        public User? Owner { get; set; }
        
        public List<Issue> Issues { get; set; } = new();
        
        /// <summary>
        /// The sponsorships that have been made on the basis of this repository.
        /// </summary>
        public List<Sponsorship> Sponsorships { get; set; } = new();
    }
}