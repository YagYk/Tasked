module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.27.0"

  cluster_name                   = local.name
  cluster_endpoint_public_access = true

  access_entries = {
    jenkins = {
      principal_arn = "arn:aws:iam::215764924067:user/Yagyansh-Khandelwal"

      access_policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }

  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
  }

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets

  eks_managed_node_groups = {
    panda-node = {
      min_size     = 2
      max_size     = 4
      desired_size = 2

      instance_types = ["t3.small"]
      capacity_type  = "SPOT"

      tags = {
        ExtraTag = "Panda_Node"
      }
    }
  }

  tags = local.tags
}
