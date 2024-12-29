#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking system prerequisites...${NC}"
    
    # Check Node.js
    if ! command_exists node; then
        echo -e "${RED}Node.js is not installed. Please install Node.js 18+ first.${NC}"
        exit 1
    fi
    
    # Check npm
    if ! command_exists npm; then
        echo -e "${RED}npm is not installed. Please install npm first.${NC}"
        exit 1
    fi
    
    # Check PostgreSQL tools
    if ! command_exists psql; then
        echo -e "${RED}psql is not installed. Please install PostgreSQL first.${NC}"
        exit 1
    fi
    
    if ! command_exists createdb; then
        echo -e "${RED}createdb is not installed. Please install PostgreSQL first.${NC}"
        exit 1
    fi
}

# Setup environment
setup_environment() {
    echo -e "${YELLOW}Setting up environment...${NC}"
    
    # Copy .env example if .env doesn't exist
    if [ ! -f .env ]; then
        cp .env_example .env
        echo -e "${GREEN}.env file created from .env_example${NC}"
    fi
}

# Install dependencies
install_dependencies() {
    echo -e "${YELLOW}Installing project dependencies...${NC}"
    npm install
}

# Setup database
setup_database() {
    echo -e "${YELLOW}Setting up database...${NC}"
    
    # Check if DATABASE_URL is set in .env
    if [ -f .env ]; then
        # Source .env file to get environment variables
        set -a
        source .env
        set +a
        
        # Validate DATABASE_URL
        if [ -z "$DATABASE_URL" ]; then
            echo -e "${RED}Error: DATABASE_URL is not set in .env file.${NC}"
            exit 1
        fi
        
        # Extract database connection details
        DB_HOST=$(echo "$DATABASE_URL" | sed -E 's/.*:\/\/([^:]+):?([0-9]+)?@([^:/]+).*/\3/')
        DB_PORT=$(echo "$DATABASE_URL" | sed -E 's/.*:\/\/[^:]+:?([0-9]+)?@[^:/]+:?([0-9]+)?.*/\2/' | grep -E '^[0-9]+$' || echo "5432")
        DB_NAME=$(echo "$DATABASE_URL" | sed -E 's/.*\/([^?]+).*/\1/')
        
        # Attempt to create database
        echo -e "${YELLOW}Attempting to create database: $DB_NAME${NC}"
        if PGPASSWORD=$(echo "$DATABASE_URL" | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/') createdb -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" 2>/dev/null; then
            echo -e "${GREEN}Database $DB_NAME created successfully.${NC}"
        else
            echo -e "${YELLOW}Database $DB_NAME may already exist or creation failed. Continuing...${NC}"
        fi
    else
        echo -e "${RED}Error: .env file not found. Please create .env file with DATABASE_URL.${NC}"
        exit 1
    fi
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate dev
    
    # Seed database
    npx prisma db seed
}

# Start development server
start_dev_server() {
    echo -e "${YELLOW}Starting development server...${NC}"
    npm run dev
}

# Main setup function
main() {
    echo -e "${GREEN}🚀 BudgetLens Local Setup Script 🚀${NC}"
    
    # Check prerequisites
    check_prerequisites
    
    # Setup environment
    setup_environment
    
    # Install dependencies
    install_dependencies
    
    # Setup database
    setup_database
    
    # Start dev server
    echo -e "${GREEN}Setup complete! Opening development server...${NC}"
    start_dev_server
}

# Run main function
main
